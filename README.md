# 台股微笑曲線盯盤 App

手機 App，監控最多 5 檔台股，每檔獨立設定策略（微笑曲線網格 / RSI / 均線 /
金字塔加碼狀態機），本機背景查價比對策略、觸發時發本機通知；可將目前策略比較
結果匯出，透過 iOS 捷徑轉交 Claude App 取得 AI 分析意見。純 Client 端架構，
無後端伺服器。

**產品目標**：讓使用者依資訊與策略穩定累積資產。UI 以「按表操課」為原則——
策略輸出必須是可直接執行的行動指示（今天做什麼、金額多少、防守價在哪），
不是需要使用者再解讀的技術指標。

## 常用指令

```bash
# 安裝依賴
npm install

# 本機開發（開發用 client，非 Expo Go，因為用到 background-task / sqlite 等 native module）
npx expo run:ios
npx expo run:android

# 型別檢查 + Lint
npm run typecheck
npm run lint

# 單元測試（策略引擎是純函式，優先確保這塊測試覆蓋率）
npm test
npm test -- --coverage

# 每次完成一個 Phase / 合併前手動進版（見 scripts/bump_version.sh）
./scripts/bump_version.sh patch   # patch | minor | major
```

**建置/發布指令待補**：建置方式尚未決定（EAS Build vs. `expo prebuild` + 原生
xcodebuild/fastlane 在 GitHub Actions macOS runner 上跑，見下方「待決策事項」），
目前只有 lint/test 這條 CI 有接上，等 App 有實際功能可裝機測試時再決定並補上此區塊。

## 常見問題

**手機上開 App 跳出「No script URL provided」或類似的原生紅色錯誤畫面**

這是 dev build 連不到 Metro（本機開發伺服器）才會出現的畫面，不是 App 的
邏輯錯誤。最常見的原因是 Metro 綁在某個 terminal session 上，關掉那個
terminal（或 VS Code 視窗）之後 Metro 就跟著被砍掉了，之後開 App 自然連不到。

解法：用 `npm run metro:start` 啟動 Metro——這支 script 會用 `nohup` 讓
Metro 常駐執行，不綁定在啟動它的 terminal 上，關掉 terminal 也不會把它
砍掉，只有明確執行 `npm run metro:stop`、或整台電腦重開機/登出才會停止。
開發時建議一開始先跑一次 `npm run metro:start`，之後就可以放著不管，
用 `npm run metro:status` 確認是否還在跑。

```bash
npm run metro:start   # 啟動（已經在跑會直接告知，不會重複啟動）
npm run metro:status  # 確認目前是否在跑
npm run metro:stop    # 停止
```

跳出紅屏當下如果 Metro 其實已經在跑，通常是 App 啟動時間點剛好搶在
Metro 就緒之前，點畫面上的「Reload JS」重新整理一次即可恢復，不用重新
建置整個 App。

## 架構重點

專案結構（managed Expo workflow，TypeScript）：

```
src/
  strategy-engine/       # 純函式，與平台無關，禁止在此 import 任何 RN/Expo API
    types.ts             # Strategy 介面、StrategySignal、PricePoint 型別
    grid-strategy.ts      # 微笑曲線網格策略
    rsi-strategy.ts        # RSI 策略
    ma-cross-strategy.ts   # 均線交叉策略
    pyramid-state-machine.ts # 金字塔加碼狀態機（有狀態策略，規格見 docs/pyramid-state-machine-spec.md）
    engine.ts             # 統一入口：輸入 priceHistory + strategy config，輸出 signal
    __tests__/            # 每個策略獨立測試，涵蓋邊界情況

  data-fetch/
    twse-client.ts        # TWSE OpenAPI 呼叫封裝，含重試與格式錯誤處理
    price-history-sync.ts # 每日收盤價寫入本機 DB

  db/
    schema.ts              # SQLite 建表
    watchlist-repo.ts
    price-history-repo.ts
    notification-log-repo.ts

  background/
    background-fetch-task.ts   # 註冊 expo-background-task，呼叫 data-fetch + strategy-engine
    foreground-poll.ts         # App 開著時，依使用者設定的查價間隔前景輪詢（比背景可靠）

  notifications/
    local-notification.ts      # expo-notifications 包裝，含 notification-log 去重邏輯

  export/
    shortcuts-export.ts        # 產生策略比較摘要 (JSON/純文字)，透過 Share Sheet 匯出

  ui/
    screens/
    components/
```

**核心規則：`strategy-engine/` 內的程式碼不得 import 任何 RN、Expo 或 DB 相關套件。**
這層只吃資料、吐結果，才能真正獨立單元測試，也才能之後輕鬆加新策略而不動其他層。

- 商業邏輯（策略比對、觸發判斷）：`src/strategy-engine`、`src/data-fetch`
- UI 只做顯示與使用者輸入，不做任何策略計算
- 依賴管理：npm，鎖定用 `package-lock.json`
- 背景執行為盡力而為（best-effort），不保證頻率，UI 必須顯示「上次背景更新時間」

## 資料模型（SQLite）

- `watchlist`：標的代號、預算、查價間隔（可個別覆蓋全域設定）、啟用中的策略清單
- `strategy_config`：所屬 watchlist_id、策略類型（grid/rsi/ma_cross）、該策略專屬參數（JSON）
- `price_history`：標的代號、日期、收盤價、最高、最低、成交量（RSI/均線計算依據）
- `grid_tiers`：網格策略專用，所屬 strategy_config_id、檔位序號、觸發價、狀態
- `pyramid_state`（**待新增**，金字塔狀態機策略接進 DB/UI 時建）：所屬
  strategy_config_id、目前狀態、候選狀態與天數、已加碼級數、上次加碼價、
  移動停損價、突破待確認計數、盤整區間邊界；另建狀態變化歷史表供回測除錯
- `notification_log`：避免同一訊號重複通知，記錄已發送的 (watchlist_id, strategy_config_id, signal_key, 時間)

## CI/CD

- `.github/workflows/ci.yml`：push / PR 觸發，跑 `typecheck` + `lint` + `test`
- **建置/發布自動化尚未接上，待決定方案（見下方待決策事項）**：
  - 方案 A：EAS Build，需要 Expo 帳號 + repo secret `EXPO_TOKEN`
  - 方案 B：`npx expo prebuild` 產生原生專案 + GitHub Actions macOS runner 跑
    xcodebuild/fastlane，需要自行管理 Apple 簽章憑證存成 GitHub Secrets（與既有
    iOS 專案模式一致）
  - 兩者都能用到 `expo-sqlite` / `expo-background-fetch` / `expo-notifications`
    等 Expo SDK 模組，選哪個不影響前面的架構規劃
  - 決定時機：Phase 3、4 完成、App 有實際功能可裝機測試時再回頭決定

## Git 版控慣例

- Conventional Commits：`feat: `, `fix: `, `test: `, `refactor: `, `chore: `
- 每完成一個可獨立驗證的 Phase（見開發指引）就 commit 一次，訊息說明做了什麼、驗證方式
- `./scripts/bump_version.sh` 會同步更新 `package.json` version、`app.json` 的
  `expo.version` / `ios.buildNumber` / `android.versionCode`，並自動建立 git tag
- 不要手動改版本號，一律透過腳本，避免三處版號不同步

## 注意

- **TWSE OpenAPI 是快照資料，非逐筆即時**，且格式偶爾變動，`twse-client.ts` 必須有明確的
  格式驗證與失敗處理，不可假設回傳結構永遠一致
- **背景任務頻率不可控**，`expo-background-task`（原本規劃的 `expo-background-fetch`
  在這個 SDK 版本已標記 deprecated，已改用官方建議的替代套件）只是嘗試向系統「請求」
  執行，不是排程保證。相關實測結果見下方「背景任務實測頻率」
- **RSI / 均線需要足夠的歷史資料才有意義**，新增標的的前幾天策略引擎應回傳「資料不足」而非
  硬算出誤導性訊號
- **不要把任何 API key 或憑證寫死在程式碼**，TWSE OpenAPI 目前不需要 key，但若未來換成
  付費資料源，一律用 EAS Secrets 或 `.env`（並加進 `.gitignore`）
- **Shortcuts 匯出走 Share Sheet，不做 App Intents**：`shortcuts-export.ts` 只需產生
  文字/JSON 並呼叫系統分享，不需要 native module 開發。使用者如何在 iOS 捷徑 App
  設定「分享面板選捷徑 → 轉交 Claude App」，見
  [`docs/ios-shortcuts-setup.md`](docs/ios-shortcuts-setup.md)
- **建置/發布方案尚未決定**（EAS vs. 原生 xcodebuild runner），現階段不要在程式碼或
  文件中預設用 EAS，避免之後改方案要大改

## 背景任務實測頻率

`src/background/background-fetch-task.ts` 用 `expo-background-task` 註冊，
`minimumInterval` 設為 15 分鐘（該套件允許的最小值）。**這只是最小間隔提示，
不是排程保證**——`expo-background-task` 官方型別註解明確寫著：

> Tasks won't run exactly on schedule. On iOS, short intervals are often
> ignored — the system typically runs background tasks during specific
> windows, such as overnight.

在寫這份文件的當下（開發環境沒有實體裝置/模擬器可以長時間觀察），還沒有實測數據。
**這一段等你在實機上跑一段時間（建議至少觀察 1–2 天）後，麻煩回報：**

- 實際觀察到背景任務被系統呼叫的頻率／時間點（iOS 和 Android 可能差很多）
- App 在背景多久沒開、電量模式（低電量模式會影響）是否影響觸發
- `DevBackgroundScreen` 裡「上次背景執行時間」顯示的間隔紀錄

拿到實測數據後把這段更新掉，不要讓「15 分鐘」這個數字被誤讀成「每 15 分鐘會執行一次」。
