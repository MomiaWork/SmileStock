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
    sectionPyramid: string;
    sectionPyramidFooter: string;
    fieldPyramidEnabled: string;
    fieldEntryPrice: string;
    placeholderEntryFetching: string;
    placeholderEntryExample: string;
    fieldAddOnStyle: string;
    addOnStyleEqual: string;
    addOnStylePyramid: string;
    addOnStyleDecreasing: string;
    fieldAddOnPace: string;
    validationPyramid: string;
    pyramidResetWarningTitle: string;
    pyramidResetWarningMessage: string;
  };
  stockDetail: {
    sectionChart: string;
    sectionTrend: string;
    sectionStrategyStatus: string;
    strategyNameGrid: string;
    strategyNamePyramid: string;
    noStrategyTitle: string;
    noStrategySubtitle: string;
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
    pyramidStateLabel: (stateLabel: string, tierIndex: number | undefined) => string;
    pyramidMarketState: {
      TRENDING_UP: string;
      TRENDING_DOWN: string;
      CONSOLIDATION: string;
      BREAKOUT_UP: string;
      BREAKOUT_DOWN: string;
    };
    sectionTodayAction: string;
    todayActionLabel: {
      enter: string;
      add: string;
      exit: string;
      wait: string;
      freeze: string;
      hold: string;
      no_signal: string;
      insufficient_data: string;
    };
    todayActionTitle: (
      label: string,
      tierIndex: number | undefined,
      amount: number | undefined,
    ) => string;
    prefillTradeButton: string;
    prefillTradeDoneTitle: string;
    prefillTradeDoneMessage: string;
    sectionReconciliation: string;
    reconciliationStatus: { underfunded: string; overfunded: string };
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
    fieldBudget: string;
    analyze: string;
    pleaseEnterCode: string;
    invalidBudget: string;
    insufficientDataTitle: string;
    insufficientDataMessage: (code: string, months: number) => string;
    analyzeFailedTitle: string;
    disclaimer: (code: string, months: number) => string;
    resultLine1: (spacing: number, tier: number, filterLabel: string) => string;
    filterOn: string;
    filterOff: string;
    resultLine2: (totalReturn: string, maxDrawdown: string, tradeCount: number) => string;
    comboSectionTitle: string;
    comboFooter: string;
    applyCombo: string;
    editCombo: string;
    priceNotFoundTitle: string;
    priceNotFoundMessage: (code: string) => string;
    applyFailedTitle: string;
    buyHoldLabel: (returnPercent: string) => string;
    strategyTypeGrid: string;
    strategyTypePyramid: string;
    pyramidResultLine1: (weights: string, addTrigger: number) => string;
    riskLevelLabel: (level: string) => string;
    riskLevelLow: string;
    riskLevelMedium: string;
    riskLevelHigh: string;
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
    emptyTitle: '還沒有任何標的',
    emptySubtitle: '按右上角「＋」新增第一檔追蹤標的',
    deleteTitle: '刪除標的',
    deleteMessage: (code, name) => `確定要刪除 ${code} ${name} 嗎？`,
    cancel: '取消',
    delete: '刪除',
    checkCompleteTitle: '立即檢查完成',
    checkCompleteMessage: (total, notified, extraNote) =>
      `檢查了 ${total} 檔標的，其中 ${notified} 檔發出新的行動提醒${extraNote}`,
    checkFailedTitle: '立即檢查失敗',
    shareFailedTitle: '分享失敗',
    claudeFailedTitle: '執行捷徑失敗',
    limitReachedTitle: '已達上限',
    limitReachedMessage: (max) => `最多只能追蹤 ${max} 檔標的，請先刪除一筆再新增`,
    notifiedFailedNote: (count) => `，${count} 個通知發送失敗`,
    syncFailedNote: (error) => `\n\n更新最新成交價失敗，改用既有歷史資料：${error}`,
    noData: '尚無資料',
    closingSuffix: '收盤',
    budgetLabel: (amount) => `預算 ${amount}`,
  },
  watchlistForm: {
    titleAdd: '新增標的',
    titleEdit: '編輯標的',
    notFound: '找不到這檔標的',
    sectionBasic: '基本資料',
    fieldStockCode: '標的代碼',
    placeholderStockCode: '例如 2330',
    fieldStockName: '標的名稱',
    placeholderStockName: '例如 台積電',
    fieldBudget: '預算',
    fieldIntervalSec: '查價間隔（秒）',
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
    validationBasic: '請確認標的代號、名稱、預算都已正確填寫',
    validationGrid: '請確認網格策略的錨定價、間距 %、檔位數都已正確填寫（需大於 0）',
    anchorNotFoundTitle: '查不到目前價格',
    anchorNotFoundMessage: (code) => `${code} 目前查不到報價，請手動輸入錨定價`,
    anchorFetchFailedTitle: '查詢目前價格失敗',
    anchorFetchFailedSuffix: '\n\n請手動輸入錨定價',
    backfillFailedTitle: '歷史資料回補失敗',
    backfillFailedSuffix: '\n\n進場確認濾網要等資料累積足夠天數才會開始判斷，稍後可再手動同步。',
    saveFailedTitle: '儲存失敗',
    sectionPyramid: '金字塔加碼',
    sectionPyramidFooter:
      '順勢策略：確認漲勢成立才加碼，加碼幅度隨漲幅拉大，移動停損只上移不下移，跌破才建議出場或減碼，由你自己判斷是否要動作。沒有固定停利/停損%，也不設無條件出場的硬停損——下跌可能只是暫時拉回，是否出場由你參考當下建議決定。內建噴出保護：股價短期漲多、乖離均線過大時會先暫緩加碼一次，不會另外提早出場。趨勢判斷用的均線等參數固定用內建設定，不開放調整，避免貼合單一標的的歷史雜訊。提醒：若你用融資或槓桿操作，本策略的出場判斷會晚於單純固定停損（避免被正常拉回洗出場），請自行留意維持率，必要時提早減碼。',
    fieldPyramidEnabled: '啟用金字塔加碼',
    fieldEntryPrice: '進場價',
    placeholderEntryFetching: '查詢中...',
    placeholderEntryExample: '例如 580',
    fieldAddOnStyle: '加碼風格',
    addOnStyleEqual: '等權重（每級加碼金額相同）',
    addOnStylePyramid: '金字塔式（越漲加越多）',
    addOnStyleDecreasing: '遞減式（越漲加越少）',
    fieldAddOnPace: '加碼步調（漲多少 % 加碼一次）',
    validationPyramid: '請確認金字塔加碼的進場價已正確填寫（需大於 0）',
    pyramidResetWarningTitle: '注意：儲存會重置金字塔加碼狀態',
    pyramidResetWarningMessage:
      '金字塔加碼會記錄目前加碼到第幾級、停損價等狀態，編輯這檔標的（即使只改查價間隔等其他欄位）目前會把這個狀態重置回初始值，需要重新累積。確定要儲存嗎？',
  },
  stockDetail: {
    sectionChart: '價格走勢',
    sectionTrend: '目前趨勢',
    sectionStrategyStatus: '策略狀態細節',
    strategyNameGrid: '微笑曲線網格',
    strategyNamePyramid: '金字塔加碼',
    noStrategyTitle: '沒有啟用任何策略',
    noStrategySubtitle: '到編輯標的頁面開啟策略後，這裡每天會給出可直接執行的行動指示',
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
    loadFailedTitle: '讀取標的資料失敗',
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
    pyramidStateLabel: (stateLabel, tierIndex) =>
      tierIndex !== undefined ? `${stateLabel} ／ 第 ${tierIndex} 級加碼` : stateLabel,
    pyramidMarketState: {
      TRENDING_UP: '📈 趨勢上',
      TRENDING_DOWN: '📉 趨勢下',
      CONSOLIDATION: '⏸️ 盤整凍結',
      BREAKOUT_UP: '🚀 向上突破',
      BREAKOUT_DOWN: '⚠️ 向下突破',
    },
    sectionTodayAction: '今天該做的事',
    todayActionLabel: {
      enter: '🟢 建議進場',
      add: '🟢 建議加碼',
      exit: '🔴 建議出場',
      wait: '🟡 建議觀望',
      freeze: '🟡 凍結加碼，續抱',
      hold: '🟡 建議續抱',
      no_signal: '⚪️ 尚未觸發訊號',
      insufficient_data: '⚪️ 資料不足',
    },
    todayActionTitle: (label, tierIndex, amount) =>
      `${label}${tierIndex !== undefined ? `／第 ${tierIndex} 級` : ''}${amount !== undefined ? `，約 ${amount.toFixed(0)} 元` : ''}`,
    prefillTradeButton: '我已照建議操作，帶入交易紀錄',
    prefillTradeDoneTitle: '已帶入交易紀錄表單',
    prefillTradeDoneMessage: '已依建議帶入下方表單的股數與價格，請核對實際成交結果後再送出。',
    sectionReconciliation: '策略與持倉可能不同步',
    reconciliationStatus: {
      underfunded: '⚠️ 持倉小於策略記錄的加碼進度',
      overfunded: '⚠️ 持倉大於策略記錄的加碼進度',
    },
  },
  settings: {
    sectionGlobalDefaults: '全域預設',
    sectionGlobalDefaultsFooter: '個別標的若沒有自訂查價間隔，App 開著時的前景輪詢就會用這個值。',
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
    sectionAnalyze: '分析標的',
    sectionAnalyzeFooter: (months) =>
      `輸入標的代號，用過去約 ${months} 個月的歷史資料試算網格與金字塔加碼兩種策略的表現，幫你找出兩種策略各自最合適的參數。每天由 App 依市場狀態（盤整/趨勢）自動決定執行策略。抓取歷史資料需要依序呼叫多次 TWSE API，可能需要一段時間，請耐心等候。`,
    fieldStockCode: '標的代碼',
    placeholderStockCode: '例如 2330',
    fieldBudget: '預算',
    analyze: '分析',
    pleaseEnterCode: '請先輸入標的代號',
    invalidBudget: '請輸入有效的預算金額',
    insufficientDataTitle: '資料不足',
    insufficientDataMessage: (code, months) =>
      `${code} 過去 ${months} 個月的歷史資料不足以進行回測分析`,
    analyzeFailedTitle: '分析失敗',
    disclaimer: (code, months) =>
      `以上是根據 ${code} 過去約 ${months} 個月自己的歷史資料試算出來的結果，不是保證未來也會這樣表現，僅供參考。`,
    resultLine1: (spacing, tier, filterLabel) =>
      `間距 ${spacing}% ／ ${tier} 檔 ／ 確認濾網${filterLabel}`,
    filterOn: '開',
    filterOff: '關',
    resultLine2: (totalReturn, maxDrawdown, tradeCount) =>
      `總報酬 ${totalReturn}% ／ 最大回撤 ${maxDrawdown}% ／ 交易次數 ${tradeCount}`,
    comboSectionTitle: '建議設定（網格＋金字塔一起啟用）',
    comboFooter:
      '兩種策略各取回測表現最好的一組參數。套用後兩個策略一起啟用，每天由 App 依市場狀態自動決定聽誰的：盤整時依網格逢低承接，趨勢向上時依金字塔順勢加碼，趨勢向下時明確提醒不進場。',
    applyCombo: '套用（回首頁）',
    editCombo: '編輯細項再儲存',
    priceNotFoundTitle: '查無目前價格',
    priceNotFoundMessage: (code) => `查不到 ${code} 目前價格，請改用「編輯細項再儲存」手動輸入`,
    applyFailedTitle: '套用失敗',
    buyHoldLabel: (returnPercent) =>
      `同期間單純買進持有報酬率：${returnPercent}% ／ 幫你判斷這段期間主動操作是否真的比不管它更好`,
    strategyTypeGrid: '網格',
    strategyTypePyramid: '金字塔加碼',
    pyramidResultLine1: (weights, addTrigger) =>
      `加碼權重 ${weights} ／ 加碼觸發漲幅 ${addTrigger}%`,
    riskLevelLabel: (level) => `風險：${level}`,
    riskLevelLow: '低',
    riskLevelMedium: '中',
    riskLevelHigh: '高',
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
      `Checked ${total} stock(s), ${notified} sent a new action reminder${extraNote}`,
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
    sectionPyramid: 'Pyramid Add-on',
    sectionPyramidFooter:
      "A trend-following strategy: only adds once an uptrend is confirmed, add-on size grows with the move, trailing stop only moves up, and a break below it advises exiting or trimming — you decide whether to act. There's no fixed take-profit/stop-loss % and no unconditional hard stop: a drop may just be a temporary pullback, so whether to exit is your call based on the current advice. Built-in blow-off protection: when price runs too far above its moving average in a short time, the next add-on is skipped for one round — this never triggers an early exit on its own. Trend-detection parameters (moving averages, etc.) are fixed at built-in defaults and not user-adjustable, to avoid fitting one stock's historical noise. Note: if you trade this on margin/leverage, exits here lag behind a plain fixed stop-loss on purpose (to avoid being shaken out by a normal pullback) — watch your maintenance margin yourself and trim early if needed.",
    fieldPyramidEnabled: 'Enable Pyramid Add-on',
    fieldEntryPrice: 'Entry Price',
    placeholderEntryFetching: 'Fetching...',
    placeholderEntryExample: 'e.g. 580',
    fieldAddOnStyle: 'Add-on Style',
    addOnStyleEqual: 'Equal weight (same amount each add-on)',
    addOnStylePyramid: 'Pyramid style (larger amounts as it rises)',
    addOnStyleDecreasing: 'Decreasing (smaller amounts as it rises)',
    fieldAddOnPace: 'Add-on Pace (% rise before adding again)',
    validationPyramid:
      'Please make sure the pyramid add-on entry price is filled in correctly (must be greater than 0)',
    pyramidResetWarningTitle: 'Note: Saving Resets Pyramid Add-on State',
    pyramidResetWarningMessage:
      'Pyramid add-on tracks state like the current tier and stop price. Editing this stock (even unrelated fields like the check interval) currently resets that state back to its initial values, which then has to rebuild. Save anyway?',
  },
  stockDetail: {
    sectionChart: 'Price Chart',
    sectionTrend: 'Current Trend',
    sectionStrategyStatus: 'Strategy Details',
    strategyNameGrid: 'Smile Curve Grid',
    strategyNamePyramid: 'Pyramid Add-on',
    noStrategyTitle: 'No strategy enabled',
    noStrategySubtitle:
      'Enable a strategy on the edit screen to get a directly actionable instruction here every day',
    sectionPosition: 'Position & P&L',
    positionSummary: (quantity, avgCost) => `Holding ${quantity} shares, avg cost ${avgCost}`,
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
    pyramidStateLabel: (stateLabel, tierIndex) =>
      tierIndex !== undefined ? `${stateLabel} ／ Tier ${tierIndex}` : stateLabel,
    pyramidMarketState: {
      TRENDING_UP: '📈 Trending Up',
      TRENDING_DOWN: '📉 Trending Down',
      CONSOLIDATION: '⏸️ Consolidation',
      BREAKOUT_UP: '🚀 Breakout Up',
      BREAKOUT_DOWN: '⚠️ Breakout Down',
    },
    sectionTodayAction: "Today's Action",
    todayActionLabel: {
      enter: '🟢 Enter suggested',
      add: '🟢 Add-on suggested',
      exit: '🔴 Exit suggested',
      wait: '🟡 Wait suggested',
      freeze: '🟡 Add-on frozen, hold',
      hold: '🟡 Hold suggested',
      no_signal: '⚪️ No signal yet',
      insufficient_data: '⚪️ Insufficient data',
    },
    todayActionTitle: (label, tierIndex, amount) =>
      `${label}${tierIndex !== undefined ? ` ／ Tier ${tierIndex}` : ''}${amount !== undefined ? `, about ${amount.toFixed(0)}` : ''}`,
    prefillTradeButton: 'I did this — fill in trade record',
    prefillTradeDoneTitle: 'Trade form filled in',
    prefillTradeDoneMessage:
      'The suggested quantity and price were filled into the form below — please check them against what you actually traded before submitting.',
    sectionReconciliation: 'Strategy / Position May Be Out of Sync',
    reconciliationStatus: {
      underfunded: '⚠️ Position smaller than tracked add-ons',
      overfunded: '⚠️ Position larger than tracked add-ons',
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
      `Enter a stock code to backtest both grid and pyramid add-on strategies against roughly the past ${months} months of history and find the best-performing parameters for each. When applied, both strategies are enabled together, and each day the app decides which one to follow based on the market state (range-bound vs. trending) — you don't need to predict the future or pick just one. Fetching history calls the TWSE API multiple times in sequence, so it may take a while — please be patient.`,
    fieldStockCode: 'Stock Code',
    placeholderStockCode: 'e.g. 2330',
    fieldBudget: 'Budget',
    analyze: 'Analyze',
    pleaseEnterCode: 'Please enter a stock code first',
    invalidBudget: 'Please enter a valid budget amount',
    insufficientDataTitle: 'Insufficient Data',
    insufficientDataMessage: (code, months) =>
      `Not enough historical data for ${code} over the past ${months} months to run a backtest`,
    analyzeFailedTitle: 'Analysis Failed',
    disclaimer: (code, months) =>
      `The above is backtested using ${code}'s own historical data over roughly the past ${months} months. It does not guarantee future performance — for reference only.`,
    resultLine1: (spacing, tier, filterLabel) =>
      `Spacing ${spacing}% ／ ${tier} tiers ／ Confirm filter ${filterLabel}`,
    filterOn: 'On',
    filterOff: 'Off',
    resultLine2: (totalReturn, maxDrawdown, tradeCount) =>
      `Total return ${totalReturn}% ／ Max drawdown ${maxDrawdown}% ／ Trades ${tradeCount}`,
    comboSectionTitle: 'Suggested Settings (grid + pyramid enabled together)',
    comboFooter:
      'The best-performing backtested parameters for each strategy. When applied, both strategies are enabled together, and each day the app decides which one to follow based on the market state: buy the dips with the grid in range-bound markets, add with the pyramid in uptrends, and stay out with a clear reminder in downtrends.',
    applyCombo: 'Apply (back to home)',
    editCombo: 'Edit details before saving',
    priceNotFoundTitle: 'Current Price Not Found',
    priceNotFoundMessage: (code) =>
      `Could not find the current price for ${code}. Use "Edit details before saving" to enter it manually.`,
    applyFailedTitle: 'Apply Failed',
    buyHoldLabel: (returnPercent) =>
      `Buy-and-hold return over the same period: ${returnPercent}% ／ Use this to judge whether active management actually beat just holding`,
    strategyTypeGrid: 'Grid',
    strategyTypePyramid: 'Pyramid Add-on',
    pyramidResultLine1: (weights, addTrigger) =>
      `Add-on weights ${weights} ／ Add trigger ${addTrigger}%`,
    riskLevelLabel: (level) => `Risk: ${level}`,
    riskLevelLow: 'Low',
    riskLevelMedium: 'Medium',
    riskLevelHigh: 'High',
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
