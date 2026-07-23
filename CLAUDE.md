請依照以下規格，一步一步建立這個 React Native (Expo, TypeScript) 專案。
專案已有 CLAUDE.md 放在根目錄，請先讀取並遵守其中的架構規則、資料模型、
Git 版控慣例。開發過程請照下方 Phase 順序進行，**每完成一個 Phase 就用
`./scripts/bump_version.sh patch` 進版並 commit，訊息說明完成內容與如何驗證，
不要累積多個 Phase 才一次 commit。**

## 專案規格摘要

台股盯盤 App，監控最多 5 檔標的，每檔獨立設定：
- 查價間隔（可調整，App 開著時前景輪詢照此間隔；背景執行為 best-effort，不保證頻率）
- 一個或多個策略：微笑曲線網格 / RSI / 均線交叉 / 金字塔加碼狀態機
- 策略觸發時發本機通知，同一訊號不重複通知（見 CLAUDE.md 的 notification_log 設計）

純 Client 端架構，無後端伺服器，資料源為 TWSE OpenAPI（免費、無需 API key，
但為快照式資料非逐筆即時）。

**產品目標與 UI 原則**：讓使用者依資訊與策略穩定累積資產。UI/UX 以
「按表操課」為最高原則——策略輸出到畫面時必須是可直接執行的行動指示
（今天做什麼、金額多少、防守價在哪），不是需要使用者再解讀的技術指標。

### 金字塔加碼狀態機策略（進階策略）

完整規格見 `docs/pyramid-state-machine-spec.md`，實作在
`src/strategy-engine/pyramid-state-machine.ts`。與其他三個策略的關鍵差異：

- 這是**有狀態**策略，介面為 `(history, config, prevState) → { signal, nextState }`，
  函式本身仍是純函式，`PyramidState` 的持久化由呼叫端（DB 層）負責
- 不走 `evaluateStrategy` 的無狀態分派，由 `engine.ts` 另行匯出 `evaluatePyramid`
- 四種市場狀態（趨勢上/下、盤整、突破上/下），加碼只在 `TRENDING_UP` /
  `BREAKOUT_UP` 觸發；盤整凍結加碼並上移停損；停損棘輪式只上移不下移
- 第二階段籌碼濾網（法人買賣超、集保大戶）見規格附錄 A，實作前必須先
  完成基礎版回測，濾網要在回測中證明有改善才保留
- 市場消息面**不進策略引擎**（無法回測驗證），交由 Phase 6 的 Shortcuts
  匯出 → Claude App 分析流程處理

## 初始化

1. 用 `npx create-expo-app` 建立 TypeScript 專案
2. 安裝：`expo-sqlite`、`expo-background-fetch`、`expo-task-manager`、
   `expo-notifications`、`expo-sharing`
3. 建立 CLAUDE.md 中列出的目錄結構
4. 設定 ESLint + Prettier + TypeScript strict mode
5. 設定 Jest，確認 `src/strategy-engine` 可以獨立跑測試（不依賴任何 RN/Expo import）
6. 初始化 git repo，建立 `.gitignore`（含 `.env`、`node_modules`、`ios/`、`android/`
   若之後有 prebuild 產物）
7. 複製我提供的 `.github/workflows/ci.yml` 與 `.github/workflows/eas-build.yml` 進去
8. 複製 `scripts/bump_version.sh` 並確認可執行
9. 初始 commit：`chore: project scaffold`

完成後跟我確認一次，我看過再繼續 Phase 1。

## Phase 1：策略引擎（純函式，最優先）

在 `src/strategy-engine/` 實作：

- `types.ts`：定義 `PricePoint { date, close, high, low, volume }`、
  `StrategySignal { triggered: boolean, reason: string, tierIndex?: number }`、
  `Strategy` 介面：`evaluate(history: PricePoint[], config: unknown): StrategySignal`
- `grid-strategy.ts`：實作微笑曲線網格判斷邏輯——
  輸入錨定價、預算、間距%、檔位數（金字塔權重 1:1.5:2:2.5:3...）、目前價格，
  輸出是否觸發、觸發第幾檔。這段邏輯我們已經在試算工具驗證過，可以直接參考其計算方式。
- `rsi-strategy.ts`：標準 RSI 計算（預設 14 日），低於可設定門檻（預設 30）視為訊號
- `ma-cross-strategy.ts`：短均線穿越長均線（參數可設定，如 5 日穿 20 日）
- `engine.ts`：統一入口，根據 `strategy_config.type` 分派到對應實作；
  歷史資料不足時回傳明確的「資料不足」結果，不要硬算
- 每個策略檔案在 `__tests__/` 寫測試，至少涵蓋：
  剛好等於門檻、一次跌穿兩檔（網格）、資料筆數不足（RSI/均線）

驗證方式：`npm test` 全過，不需要啟動 App 或連任何網路。完成後 commit + bump version。

## Phase 2：資料抓取 + 每日歷史收集

- `data-fetch/twse-client.ts`：封裝 TWSE OpenAPI 呼叫，含重試（最多 3 次、指數退避）
  與回傳格式驗證（欄位缺失要丟明確錯誤，不要靜默吞掉）
- `db/schema.ts` + repo 檔案：依 CLAUDE.md 的資料模型建表
- `data-fetch/price-history-sync.ts`：抓到當日收盤價後寫入 `price_history`，
  同一天重複執行要 upsert 不要重複插入
- 寫一個簡單的 CLI script 或測試頁面，手動觸發一次「抓 5 檔標的 → 寫入 DB →
  讀出來確認資料正確」，此階段先不接策略引擎與通知

驗證方式：手動跑一次，確認 DB 裡的資料正確、重跑不會產生重複資料列。完成後 commit + bump version。

## Phase 3：策略引擎 + 通知打通（手動觸發）

- `notifications/local-notification.ts`：串接 `expo-notifications`，發送前先查
  `notification_log` 避免重複通知同一訊號
- 在 App 內做一個「立即檢查」按鈕：讀 watchlist → 對每檔標的的每個啟用策略呼叫
  `engine.ts` → 有觸發就寫 notification_log 並發本機通知
- 這階段用假資料或少量真實標的手動測試，確認整條路徑（DB 讀取 → 策略判斷 →
  通知發送 → 去重）正確

驗證方式：手動按「立即檢查」，確認觸發規則正確的標的會跳通知，未觸發的不會，
重複按不會對同一訊號發兩次通知。完成後 commit + bump version。

## Phase 4：背景任務串接

- `background/background-fetch-task.ts`：用 `expo-task-manager` 註冊背景任務，
  內容呼叫 Phase 2 + Phase 3 的邏輯
- `background/foreground-poll.ts`：App 在前景時，依使用者設定的查價間隔用
  `setInterval` 輪詢（比背景任務可靠，作為背景不可靠時的補償）
- UI 顯示「上次背景執行時間」，並提供「手動立即更新」按鈕（複用 Phase 3 的邏輯）

驗證方式：實機測試（模擬器對背景任務行為不準確），觀察背景任務是否真的被系統呼叫，
並在 README 或程式碼註解記錄實測到的觸發頻率，不要假設一定每小時一次。
完成後 commit + bump version。

## Phase 5：UI

- 標的清單頁：新增/編輯/刪除 watchlist（最多 5 筆），每筆可設定查價間隔、
  啟用哪些策略與其參數
- 個股詳情頁：顯示目前策略狀態、歷史觸發記錄、目前價格走勢（簡單折線圖即可）
- 設定頁：全域預設查價間隔、通知權限狀態

驗證方式：走過一次完整使用者流程（新增標的 → 設定策略 → 手動檢查 → 看到通知 →
查看歷史記錄）。完成後 commit + bump version。

## Phase 6：Shortcuts 匯出（選做，前面都完成且穩定後再做）

- `export/shortcuts-export.ts`：把目前所有標的的策略比較結果組成一段結構化文字
  （或 JSON），呼叫 `expo-sharing` 開啟系統分享面板
- 額外提供一份「如何在 iOS 捷徑 App 建立自動化」的操作說明文件（純文字步驟，
  非程式碼），描述使用者如何：從分享面板選擇捷徑 → 捷徑把文字轉交 Claude App →
  取得 AI 分析意見。這段是使用者手動設定的捷徑流程，App 本身只需要把資料
  匯出成好讀的文字/JSON，不需要開發任何深度整合程式碼

驗證方式：手動分享一次，確認匯出的文字/JSON 內容完整、格式清楚可讀。

---

## 重要提醒（請務必遵守，寫進每個 Phase 的實作中）

1. `strategy-engine/` 內任何檔案都不可以 `import` RN 或 Expo 相關套件，
   違反這條會讓策略邏輯失去獨立測試的意義
2. TWSE API 回傳格式要做驗證，不要假設欄位一定存在
3. 背景任務相關的程式碼與文件用詞避免「即時」、「保證」這類字眼，
   一律用「嘗試」、「best-effort」，UI 文案也要如實反映
4. 每個 Phase 結束都要進版 + commit，不要等到全部做完才一次 commit
5. 有任何規格不清楚的地方，先問我，不要自行假設後直接大量產出程式碼
