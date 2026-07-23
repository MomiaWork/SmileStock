export interface Translations {
  common: {
    save: string;
    loading: string;
    unknown: string;
    none: string;
  };
  watchlist: {
    title: string;
    strategyRecommendation: string;
    immediateCheck: string;
    checking: string;
    share: string;
    sharing: string;
    claudeAnalyze: string;
    claudeAnalyzing: string;
    emptyTitle: string;
    emptySubtitle: string;
    deleteTitle: string;
    deleteMessage: (code: string, name: string) => string;
    cancel: string;
    delete: string;
    checkCompleteTitle: string;
    checkCompleteMessage: (total: number, notified: number, extraNote: string) => string;
    checkFailedTitle: string;
    shareFailedTitle: string;
    claudeFailedTitle: string;
    limitReachedTitle: string;
    limitReachedMessage: (max: number) => string;
    notifiedFailedNote: (count: number) => string;
    syncFailedNote: (error: string) => string;
    noData: string;
    closingSuffix: string;
    budgetLabel: (amount: string) => string;
  };
  watchlistForm: {
    titleAdd: string;
    titleEdit: string;
    notFound: string;
    sectionBasic: string;
    fieldStockCode: string;
    placeholderStockCode: string;
    fieldStockName: string;
    placeholderStockName: string;
    fieldBudget: string;
    fieldIntervalSec: string;
    sectionExit: string;
    sectionExitFooter: string;
    fieldTakeProfit: string;
    placeholderTakeProfit: string;
    fieldStopLoss: string;
    placeholderStopLoss: string;
    sectionGrid: string;
    fieldGridEnabled: string;
    fieldAnchorPrice: string;
    placeholderAnchorFetching: string;
    placeholderAnchorExample: string;
    fieldSpacingPercent: string;
    fieldTierCount: string;
    sectionEntryConfirm: string;
    sectionEntryConfirmFooter: string;
    fieldEntryConfirmEnabled: string;
    validationBasic: string;
    validationGrid: string;
    anchorNotFoundTitle: string;
    anchorNotFoundMessage: (code: string) => string;
    anchorFetchFailedTitle: string;
    anchorFetchFailedSuffix: string;
    backfillFailedTitle: string;
    backfillFailedSuffix: string;
    saveFailedTitle: string;
  };
  stockDetail: {
    sectionChart: string;
    sectionTrend: string;
    sectionEntryAdvice: string;
    sectionStrategyStatus: string;
    noStrategyTitle: string;
    noStrategySubtitle: string;
    triggered: string;
    notTriggered: string;
    sectionPosition: string;
    positionSummary: (quantity: number, avgCost: string) => string;
    pnlSummary: (marketValue: string, pnl: string, returnRate: string) => string;
    noPositionTitle: string;
    noPositionSubtitle: string;
    sectionRecordTrade: string;
    buy: string;
    sell: string;
    fieldTradePrice: string;
    fieldQuantity: string;
    fieldNote: string;
    placeholderOptional: string;
    addBuyRecord: string;
    addSellRecord: string;
    sectionTrades: string;
    noTradesTitle: string;
    noTradesSubtitle: string;
    sectionNotifications: string;
    noNotificationsTitle: string;
    noNotificationsSubtitle: string;
    loadFailedTitle: string;
    tradeValidation: string;
    tradeFailedTitle: string;
    tradeSummary: (sideLabel: string, quantity: number, price: number) => string;
    trend: { smile: string; cry: string; neutral: string };
    entryAction: { enter: string; wait: string; no_signal: string };
    exitAction: { exit_take_profit: string; exit_stop_loss: string; hold: string };
  };
  settings: {
    sectionGlobalDefaults: string;
    sectionGlobalDefaultsFooter: string;
    fieldIntervalSec: string;
    fieldClaudeShortcutName: string;
    saved: string;
    claudeShortcutFootnote: string;
    sectionNotificationPermission: string;
    currentStatus: string;
    granted: string;
    denied: string;
    requestPermission: string;
    sectionBackgroundTask: string;
    sectionBackgroundTaskFooter: string;
    lastRunTime: string;
    lastRunResult: string;
    neverRun: string;
    sectionLanguage: string;
    languageSystem: string;
    languageZh: string;
    languageEn: string;
  };
  strategyRecommendation: {
    sectionAnalyze: string;
    sectionAnalyzeFooter: (months: number) => string;
    fieldStockCode: string;
    placeholderStockCode: string;
    analyze: string;
    pleaseEnterCode: string;
    insufficientDataTitle: string;
    insufficientDataMessage: (code: string, months: number) => string;
    analyzeFailedTitle: string;
    resultsSectionTitle: string;
    disclaimer: (code: string, months: number) => string;
    noResults: string;
    resultLine1: (
      spacing: number,
      tier: number,
      filterLabel: string,
      tp: number,
      sl: number,
    ) => string;
    filterOn: string;
    filterOff: string;
    resultLine2: (totalReturn: string, maxDrawdown: string, tradeCount: number) => string;
    apply: string;
  };
  priceChart: {
    insufficientData: string;
    lowHigh: (low: number, high: number) => string;
  };
  navigation: {
    watchlistTitle: string;
    settingsTitle: string;
    strategyRecommendationTitle: string;
  };
}

export const zh: Translations = {
  common: {
    save: '儲存',
    loading: '載入中...',
    unknown: '未知',
    none: '無',
  },
  watchlist: {
    title: '清單',
    strategyRecommendation: '策略建議',
    immediateCheck: '立即檢查',
    checking: '檢查中...',
    share: '分享',
    sharing: '分享中...',
    claudeAnalyze: 'Claude 分析',
    claudeAnalyzing: '啟動中...',
    emptyTitle: '還沒有任何股票',
    emptySubtitle: '按右上角「＋」新增第一檔追蹤股票',
    deleteTitle: '刪除股票',
    deleteMessage: (code, name) => `確定要刪除 ${code} ${name} 嗎？`,
    cancel: '取消',
    delete: '刪除',
    checkCompleteTitle: '立即檢查完成',
    checkCompleteMessage: (total, notified, extraNote) =>
      `檢查了 ${total} 個策略設定，其中 ${notified} 個發出新通知${extraNote}`,
    checkFailedTitle: '立即檢查失敗',
    shareFailedTitle: '分享失敗',
    claudeFailedTitle: '執行捷徑失敗',
    limitReachedTitle: '已達上限',
    limitReachedMessage: (max) => `最多只能追蹤 ${max} 檔股票，請先刪除一筆再新增`,
    notifiedFailedNote: (count) => `，${count} 個通知發送失敗`,
    syncFailedNote: (error) => `\n\n更新最新成交價失敗，改用既有歷史資料：${error}`,
    noData: '尚無資料',
    closingSuffix: '收盤',
    budgetLabel: (amount) => `預算 ${amount}`,
  },
  watchlistForm: {
    titleAdd: '新增股票',
    titleEdit: '編輯股票',
    notFound: '找不到這筆股票',
    sectionBasic: '基本資料',
    fieldStockCode: '股票代碼',
    placeholderStockCode: '例如 2330',
    fieldStockName: '股票名稱',
    placeholderStockName: '例如 台積電',
    fieldBudget: '預算',
    fieldIntervalSec: '查價間隔（秒）',
    sectionExit: '出場設定',
    sectionExitFooter: '持有部位時用來判斷是否建議出場，留空使用預設值（停利 10%／停損 8%）',
    fieldTakeProfit: '停利 %',
    placeholderTakeProfit: '留空預設 10',
    fieldStopLoss: '停損 %',
    placeholderStopLoss: '留空預設 8',
    sectionGrid: '微笑曲線網格',
    fieldGridEnabled: '啟用網格策略',
    fieldAnchorPrice: '錨定價',
    placeholderAnchorFetching: '查詢中...',
    placeholderAnchorExample: '例如 580',
    fieldSpacingPercent: '間距 %',
    fieldTierCount: '檔位數',
    sectionEntryConfirm: '進場確認濾網',
    sectionEntryConfirmFooter:
      '開啟後，網格觸發時除了看趨勢是否止穩，還會多確認一次近期動能是否轉強，兩項都通過才建議進場，未通過先建議觀望。',
    fieldEntryConfirmEnabled: '啟用進場確認濾網',
    validationBasic: '請確認股票代號、名稱、預算都已正確填寫',
    validationGrid: '請確認網格策略的錨定價、間距 %、檔位數都已正確填寫（需大於 0）',
    anchorNotFoundTitle: '查不到目前價格',
    anchorNotFoundMessage: (code) => `${code} 目前查不到報價，請手動輸入錨定價`,
    anchorFetchFailedTitle: '查詢目前價格失敗',
    anchorFetchFailedSuffix: '\n\n請手動輸入錨定價',
    backfillFailedTitle: '歷史資料回補失敗',
    backfillFailedSuffix:
      '\n\n進場確認濾網要等資料累積足夠天數才會開始判斷，稍後可再手動同步。',
    saveFailedTitle: '儲存失敗',
  },
  stockDetail: {
    sectionChart: '價格走勢',
    sectionTrend: '目前趨勢',
    sectionEntryAdvice: '進場建議',
    sectionStrategyStatus: '目前策略狀態',
    noStrategyTitle: '沒有啟用任何策略',
    noStrategySubtitle: '到編輯股票頁面開啟策略後會顯示在這裡',
    triggered: '🔴 已觸發',
    notTriggered: '⚪️ 未觸發',
    sectionPosition: '持倉與損益',
    positionSummary: (quantity, avgCost) => `持有 ${quantity} 股，平均成本 ${avgCost}`,
    pnlSummary: (marketValue, pnl, returnRate) =>
      `目前市值 ${marketValue}，損益 ${pnl}（報酬率 ${returnRate}%）`,
    noPositionTitle: '目前沒有持倉',
    noPositionSubtitle: '記錄一筆買入交易後會顯示持倉與損益',
    sectionRecordTrade: '記錄交易',
    buy: '買入',
    sell: '賣出',
    fieldTradePrice: '成交價',
    fieldQuantity: '股數',
    fieldNote: '備註',
    placeholderOptional: '選填',
    addBuyRecord: '新增買入記錄',
    addSellRecord: '新增賣出記錄',
    sectionTrades: '交易紀錄',
    noTradesTitle: '還沒有任何交易記錄',
    noTradesSubtitle: '記錄買賣後會顯示在這裡',
    sectionNotifications: '歷史觸發記錄',
    noNotificationsTitle: '還沒有發送過通知',
    noNotificationsSubtitle: '策略觸發時會記錄在這裡',
    loadFailedTitle: '讀取股票資料失敗',
    tradeValidation: '請確認成交價與股數都已正確填寫',
    tradeFailedTitle: '記錄交易失敗',
    tradeSummary: (sideLabel, quantity, price) => `${sideLabel} ${quantity} 股 @ ${price}`,
    trend: {
      smile: '😊 笑臉（止穩反彈）',
      cry: '😢 哭臉（持續破底）',
      neutral: '😐 中性（趨勢不明）',
    },
    entryAction: {
      enter: '🟢 建議進場',
      wait: '🟡 建議觀望',
      no_signal: '⚪️ 尚未觸發網格',
    },
    exitAction: {
      exit_take_profit: '🟢 建議停利出場',
      exit_stop_loss: '🔴 建議停損出場',
      hold: '🟡 建議續抱',
    },
  },
  settings: {
    sectionGlobalDefaults: '全域預設',
    sectionGlobalDefaultsFooter: '個別股票若沒有自訂查價間隔，App 開著時的前景輪詢就會用這個值。',
    fieldIntervalSec: '查價間隔（秒）',
    fieldClaudeShortcutName: 'Claude 捷徑名稱',
    saved: '已儲存',
    claudeShortcutFootnote:
      '首頁「Claude 分析」按鈕會直接執行這個名稱的 iOS 捷徑，名稱必須與捷徑 App 內的完全一致。捷徑設定方式見 docs/ios-shortcuts-setup.md。',
    sectionNotificationPermission: '通知權限',
    currentStatus: '目前狀態',
    granted: '已授權',
    denied: '未授權',
    requestPermission: '要求通知權限',
    sectionBackgroundTask: '背景任務',
    sectionBackgroundTaskFooter:
      '背景執行為 best-effort，實際觸發頻率由系統決定，App 開著時請以前景輪詢為主。',
    lastRunTime: '上次背景執行時間',
    lastRunResult: '上次結果',
    neverRun: '尚未執行過',
    sectionLanguage: '語言',
    languageSystem: '系統預設',
    languageZh: '中文',
    languageEn: 'English',
  },
  strategyRecommendation: {
    sectionAnalyze: '分析股票',
    sectionAnalyzeFooter: (months) =>
      `輸入股票代號，用過去約 ${months} 個月的歷史資料試算幾組網格參數設定的表現，幫你決定新增這支股票時要用哪組設定。抓取歷史資料需要依序呼叫多次 TWSE API，可能需要一段時間，請耐心等候。`,
    fieldStockCode: '股票代碼',
    placeholderStockCode: '例如 2330',
    analyze: '分析',
    pleaseEnterCode: '請先輸入股票代號',
    insufficientDataTitle: '資料不足',
    insufficientDataMessage: (code, months) =>
      `${code} 過去 ${months} 個月的歷史資料不足以進行回測分析`,
    analyzeFailedTitle: '分析失敗',
    resultsSectionTitle: '建議設定（依風險調整後報酬排序，前 5 名）',
    disclaimer: (code, months) =>
      `以上是根據 ${code} 過去約 ${months} 個月自己的歷史資料試算出來的結果，不是保證未來也會這樣表現，僅供參考。`,
    noResults: '資料不足，無法產生建議',
    resultLine1: (spacing, tier, filterLabel, tp, sl) =>
      `間距 ${spacing}% ／ ${tier} 檔 ／ 確認濾網${filterLabel} ／ 停利${tp}% ／ 停損${sl}%`,
    filterOn: '開',
    filterOff: '關',
    resultLine2: (totalReturn, maxDrawdown, tradeCount) =>
      `總報酬 ${totalReturn}% ／ 最大回撤 ${maxDrawdown}% ／ 交易次數 ${tradeCount}`,
    apply: '套用這組設定',
  },
  priceChart: {
    insufficientData: '歷史資料不足，無法繪製走勢圖',
    lowHigh: (low, high) => `低 ${low} / 高 ${high}`,
  },
  navigation: {
    watchlistTitle: '清單',
    settingsTitle: '設定',
    strategyRecommendationTitle: '策略建議',
  },
};

export const en: Translations = {
  common: {
    save: 'Save',
    loading: 'Loading...',
    unknown: 'Unknown',
    none: 'None',
  },
  watchlist: {
    title: 'Watchlist',
    strategyRecommendation: 'Strategy Advisor',
    immediateCheck: 'Check Now',
    checking: 'Checking...',
    share: 'Share',
    sharing: 'Sharing...',
    claudeAnalyze: 'Claude Analysis',
    claudeAnalyzing: 'Starting...',
    emptyTitle: 'No stocks yet',
    emptySubtitle: 'Tap "+" in the top right to add your first stock',
    deleteTitle: 'Delete Stock',
    deleteMessage: (code, name) => `Delete ${code} ${name}?`,
    cancel: 'Cancel',
    delete: 'Delete',
    checkCompleteTitle: 'Check Complete',
    checkCompleteMessage: (total, notified, extraNote) =>
      `Checked ${total} strategy setting(s), ${notified} sent new notification(s)${extraNote}`,
    checkFailedTitle: 'Check Failed',
    shareFailedTitle: 'Share Failed',
    claudeFailedTitle: 'Shortcut Failed',
    limitReachedTitle: 'Limit Reached',
    limitReachedMessage: (max) =>
      `You can track up to ${max} stocks. Delete one before adding another.`,
    notifiedFailedNote: (count) => `, ${count} notification(s) failed to send`,
    syncFailedNote: (error) =>
      `\n\nFailed to update the latest price, using existing history instead: ${error}`,
    noData: 'No data',
    closingSuffix: 'close',
    budgetLabel: (amount) => `Budget ${amount}`,
  },
  watchlistForm: {
    titleAdd: 'Add Stock',
    titleEdit: 'Edit Stock',
    notFound: 'Stock not found',
    sectionBasic: 'Basic Info',
    fieldStockCode: 'Stock Code',
    placeholderStockCode: 'e.g. 2330',
    fieldStockName: 'Stock Name',
    placeholderStockName: 'e.g. TSMC',
    fieldBudget: 'Budget',
    fieldIntervalSec: 'Price Check Interval (sec)',
    sectionExit: 'Exit Settings',
    sectionExitFooter:
      "Used to decide exit advice while holding a position. Leave blank to use the defaults (10% take-profit / 8% stop-loss).",
    fieldTakeProfit: 'Take Profit %',
    placeholderTakeProfit: 'Defaults to 10',
    fieldStopLoss: 'Stop Loss %',
    placeholderStopLoss: 'Defaults to 8',
    sectionGrid: 'Smile Curve Grid',
    fieldGridEnabled: 'Enable Grid Strategy',
    fieldAnchorPrice: 'Anchor Price',
    placeholderAnchorFetching: 'Fetching...',
    placeholderAnchorExample: 'e.g. 580',
    fieldSpacingPercent: 'Spacing %',
    fieldTierCount: 'Tier Count',
    sectionEntryConfirm: 'Entry Confirmation Filter',
    sectionEntryConfirmFooter:
      'When enabled, a grid trigger also checks whether recent momentum is turning positive in addition to trend stabilization — both must pass before entry is advised; otherwise it advises waiting.',
    fieldEntryConfirmEnabled: 'Enable Entry Confirmation Filter',
    validationBasic: 'Please make sure stock code, name, and budget are filled in correctly',
    validationGrid:
      "Please make sure the grid strategy's anchor price, spacing %, and tier count are filled in correctly (must be greater than 0)",
    anchorNotFoundTitle: 'Price Not Found',
    anchorNotFoundMessage: (code) =>
      `Couldn't find a quote for ${code} right now. Please enter the anchor price manually.`,
    anchorFetchFailedTitle: 'Failed to Fetch Current Price',
    anchorFetchFailedSuffix: '\n\nPlease enter the anchor price manually.',
    backfillFailedTitle: 'Historical Data Backfill Failed',
    backfillFailedSuffix:
      '\n\nThe entry confirmation filter needs enough accumulated days of data before it can judge — you can sync manually again later.',
    saveFailedTitle: 'Save Failed',
  },
  stockDetail: {
    sectionChart: 'Price Chart',
    sectionTrend: 'Current Trend',
    sectionEntryAdvice: 'Entry Advice',
    sectionStrategyStatus: 'Current Strategy Status',
    noStrategyTitle: 'No strategy enabled',
    noStrategySubtitle: 'Enable a strategy on the edit screen to see it here',
    triggered: '🔴 Triggered',
    notTriggered: '⚪️ Not Triggered',
    sectionPosition: 'Position & P&L',
    positionSummary: (quantity, avgCost) =>
      `Holding ${quantity} shares, avg cost ${avgCost}`,
    pnlSummary: (marketValue, pnl, returnRate) =>
      `Market value ${marketValue}, P&L ${pnl} (return ${returnRate}%)`,
    noPositionTitle: 'No position currently',
    noPositionSubtitle: 'Record a buy trade to see position and P&L',
    sectionRecordTrade: 'Record Trade',
    buy: 'Buy',
    sell: 'Sell',
    fieldTradePrice: 'Trade Price',
    fieldQuantity: 'Quantity',
    fieldNote: 'Note',
    placeholderOptional: 'Optional',
    addBuyRecord: 'Add Buy Record',
    addSellRecord: 'Add Sell Record',
    sectionTrades: 'Trade History',
    noTradesTitle: 'No trades yet',
    noTradesSubtitle: 'Trades will appear here',
    sectionNotifications: 'Notification History',
    noNotificationsTitle: 'No notifications sent yet',
    noNotificationsSubtitle: 'Recorded here when a strategy triggers',
    loadFailedTitle: 'Failed to Load Stock Data',
    tradeValidation: 'Please make sure trade price and quantity are filled in correctly',
    tradeFailedTitle: 'Failed to Record Trade',
    tradeSummary: (sideLabel, quantity, price) => `${sideLabel} ${quantity} shares @ ${price}`,
    trend: {
      smile: '😊 Smile (stabilizing rebound)',
      cry: '😢 Frown (still breaking down)',
      neutral: '😐 Neutral (trend unclear)',
    },
    entryAction: {
      enter: '🟢 Enter suggested',
      wait: '🟡 Wait suggested',
      no_signal: '⚪️ Grid not triggered yet',
    },
    exitAction: {
      exit_take_profit: '🟢 Take-profit exit suggested',
      exit_stop_loss: '🔴 Stop-loss exit suggested',
      hold: '🟡 Hold suggested',
    },
  },
  settings: {
    sectionGlobalDefaults: 'Global Defaults',
    sectionGlobalDefaultsFooter:
      "If a stock doesn't have its own price check interval, this value is used for foreground polling while the app is open.",
    fieldIntervalSec: 'Price Check Interval (sec)',
    fieldClaudeShortcutName: 'Claude Shortcut Name',
    saved: 'Saved',
    claudeShortcutFootnote:
      'The "Claude Analysis" button on the home screen runs the iOS Shortcut with this exact name — it must match the name in the Shortcuts app exactly. See docs/ios-shortcuts-setup.md for setup instructions.',
    sectionNotificationPermission: 'Notification Permission',
    currentStatus: 'Current Status',
    granted: 'Granted',
    denied: 'Not Granted',
    requestPermission: 'Request Notification Permission',
    sectionBackgroundTask: 'Background Task',
    sectionBackgroundTaskFooter:
      'Background execution is best-effort — actual trigger frequency is decided by the system. Rely on foreground polling while the app is open.',
    lastRunTime: 'Last Background Run',
    lastRunResult: 'Last Result',
    neverRun: 'Never run yet',
    sectionLanguage: 'Language',
    languageSystem: 'System Default',
    languageZh: 'Chinese',
    languageEn: 'English',
  },
  strategyRecommendation: {
    sectionAnalyze: 'Analyze Stock',
    sectionAnalyzeFooter: (months) =>
      `Enter a stock code to backtest several grid parameter sets against roughly the past ${months} months of history, helping you decide which settings to use when you add this stock. Fetching history calls the TWSE API multiple times in sequence, so it may take a while — please be patient.`,
    fieldStockCode: 'Stock Code',
    placeholderStockCode: 'e.g. 2330',
    analyze: 'Analyze',
    pleaseEnterCode: 'Please enter a stock code first',
    insufficientDataTitle: 'Insufficient Data',
    insufficientDataMessage: (code, months) =>
      `Not enough historical data for ${code} over the past ${months} months to run a backtest`,
    analyzeFailedTitle: 'Analysis Failed',
    resultsSectionTitle: 'Suggested Settings (ranked by risk-adjusted return, top 5)',
    disclaimer: (code, months) =>
      `The above is backtested using ${code}'s own historical data over roughly the past ${months} months. It does not guarantee future performance — for reference only.`,
    noResults: 'Not enough data to generate suggestions',
    resultLine1: (spacing, tier, filterLabel, tp, sl) =>
      `Spacing ${spacing}% ／ ${tier} tiers ／ Confirm filter ${filterLabel} ／ TP ${tp}% ／ SL ${sl}%`,
    filterOn: 'On',
    filterOff: 'Off',
    resultLine2: (totalReturn, maxDrawdown, tradeCount) =>
      `Total return ${totalReturn}% ／ Max drawdown ${maxDrawdown}% ／ Trades ${tradeCount}`,
    apply: 'Apply This Setting',
  },
  priceChart: {
    insufficientData: 'Not enough history to draw a chart',
    lowHigh: (low, high) => `Low ${low} / High ${high}`,
  },
  navigation: {
    watchlistTitle: 'Watchlist',
    settingsTitle: 'Settings',
    strategyRecommendationTitle: 'Strategy Advisor',
  },
};
