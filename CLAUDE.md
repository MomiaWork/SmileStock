# 台股微笑曲線盯盤 App

手機 App，監控最多 5 檔台股，每檔獨立設定策略（微笑曲線網格 / RSI / 均線），
本機背景查價比對策略、觸發時發本機通知；可將目前策略比較結果匯出，透過 iOS 捷徑
轉交 Claude App 取得 AI 分析意見。純 Client 端架構，無後端伺服器。

## 常用指令

```bash
# 安裝依賴
npm install

# 本機開發（開發用 client，非 Expo Go，因為用到 background-fetch / sqlite 等 native module）
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

# EAS 雲端建置（免本機 Xcode 簽章即可產生可安裝檔）
eas build --platform ios --profile preview
eas build --platform android --profile preview

# 正式送審 / 上架
eas build --platform ios --profile production
eas submit --platform ios
```

## 架構重點

專案結構（managed Expo workflow，TypeScript）：

```
src/
  strategy-engine/       # 純函式，與平台無關，禁止在此 import 任何 RN/Expo API
    types.ts             # Strategy 介面、StrategySignal、PricePoint 型別
    grid-strategy.ts      # 微笑曲線網格策略
    rsi-strategy.ts        # RSI 策略
    ma-cross-strategy.ts   # 均線交叉策略
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
    background-fetch-task.ts   # 註冊 expo-background-fetch，呼叫 data-fetch + strategy-engine
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

- `watchlist`：股票代號、預算、查價間隔（可個別覆蓋全域設定）、啟用中的策略清單
- `strategy_config`：所屬 watchlist_id、策略類型（grid/rsi/ma_cross）、該策略專屬參數（JSON）
- `price_history`：股票代號、日期、收盤價、最高、最低、成交量（RSI/均線計算依據）
- `grid_tiers`：網格策略專用，所屬 strategy_config_id、檔位序號、觸發價、狀態
- `notification_log`：避免同一訊號重複通知，記錄已發送的 (watchlist_id, strategy_config_id, signal_key, 時間)

## CI/CD

- `.github/workflows/ci.yml`：push / PR 觸發，跑 `typecheck` + `lint` + `test`
- `.github/workflows/eas-build.yml`：merge 到 `main` 時觸發，跑 `eas build --profile preview`
  兩平台，需要 repo secret `EXPO_TOKEN`
- 正式上架（TestFlight / Play 內部測試）維持手動觸發 `eas submit`，不做自動送審

## Git 版控慣例

- Conventional Commits：`feat: `, `fix: `, `test: `, `refactor: `, `chore: `
- 每完成一個可獨立驗證的 Phase（見開發指引）就 commit 一次，訊息說明做了什麼、驗證方式
- `./scripts/bump_version.sh` 會同步更新 `package.json` version、`app.json` 的
  `expo.version` / `ios.buildNumber` / `android.versionCode`，並自動建立 git tag
- 不要手動改版本號，一律透過腳本，避免三處版號不同步

## 注意

- **TWSE OpenAPI 是快照資料，非逐筆即時**，且格式偶爾變動，`twse-client.ts` 必須有明確的
  格式驗證與失敗處理，不可假設回傳結構永遠一致
- **iOS 背景任務頻率不可控**，`expo-background-fetch` 只是「請求」系統執行，不是排程保證，
  相關限制與 UI 因應方式見主規劃文件〈台股盯盤App規劃.md〉第 4 節
- **RSI / 均線需要足夠的歷史資料才有意義**，新增股票的前幾天策略引擎應回傳「資料不足」而非
  硬算出誤導性訊號
- **不要把任何 API key 或憑證寫死在程式碼**，TWSE OpenAPI 目前不需要 key，但若未來換成
  付費資料源，一律用 EAS Secrets 或 `.env`（並加進 `.gitignore`）
- **Shortcuts 匯出走 Share Sheet，不做 App Intents**：`shortcuts-export.ts` 只需產生
  文字/JSON 並呼叫系統分享，不需要 native module 開發
