# Liberty Lens｜美股中長期透鏡

網址：https://liberty-lens-us.netlify.app

S&P 500、Nasdaq-100 成分股與 30 檔主要 ETF 的中長期趨勢訊號：什麼時候規則上可以進場、什麼時候該出場，以及這套規則過去 24 年的實際結果。純靜態網站，不需登入；觀察清單與主題存在瀏覽器。

## 頁面

- **大盤環境**：S&P 500 中期／長期趨勢與市場廣度三項條件（順風／中性／逆風）、主要指數與資產狀態、VIX 與利率、各產業多頭比例、指數回檔深度與之後報酬。
- **進出場名單**：中期（週線）與長期（月線）各一組：進場候選、出場與警示、剛翻多、ETF 狀態。
- **全部標的**：約 550 檔，可依產業、狀態篩選與排序；星號加入觀察清單。
- **個股頁**：兩條規則的現況、趨勢線與歷次進出點、照規則操作與一直抱著的比較。
- **回測與實測**：ETF 逐檔模擬、個股彙總、各狀態之後的報酬、逐年結果、實測追蹤、規則說明與限制。

## 規則（`src/lib/signals.ts`）

| | 多頭 | 空頭 |
|---|---|---|
| 中期（每週收盤判定） | 收盤 > 40 週均線，且 10 週均線 > 40 週均線 | 兩者皆反向 |
| 長期（每月底判定） | 收盤 > 10 月均線，且 12 個月報酬 > 0 | 兩者皆反向 |

兩個條件都成立才換狀態，中間維持原狀。多頭中、且強度（中期：近 26 週報酬；長期：近 12 個月不含最近 1 個月）排在全部個股前 20% 的列為「進場候選」。價格一律用含息還原收盤價。

改規則、參數或名單定義時，必須把 `RULES_VERSION` 加一：實測追蹤只統計目前版本。

## 資料流

GitHub Actions（`.github/workflows/deploy.yml`）每個平日 22:30 UTC（美股收盤後）與每次推上 `main`：

`npm test` → `npm run data:build` → 提交 `track/` 與 `data/universe-fallback.json` → 判斷是否發布 → `npm run build` → `netlify deploy --prod --no-build`

**只有在新的一週或新的一個月走完時才發布到 Netlify**（`scripts/should-deploy.mjs`，比對 `data/last-deploy.json`），大約每月 5 次。原因：Netlify 免費方案每月 300 點，每次正式部署扣 15 點，而訊號只在週收盤與月底才會變。其餘日子照常跑測試、資料與實測紀錄，但不發布，所以網站上的價格是上一次發布時的收盤價。要立刻發布：在 Actions 頁手動執行並勾選 `force_deploy`。推程式上 `main` 不會自動發布。

- 成分股：S&P 500 來自 Wikipedia，Nasdaq-100 來自 Nasdaq 官方清單；抓不到時用上一次成功的名單（`data/universe-fallback.json`）。
- 價格：Yahoo Finance 公開的日線（25 年，含還原收盤）；VIX、10 年期與 3 個月殖利率也來自同一來源。
- 產出：`public/data/universe.json`、`market.json`、`backtest.json`、`track.json`、`h/<代號>.json`（不進版控）。
- 防呆：少於 95% 的標的有價格、或最新價格超過 6 天，就拒絕發布；盤中執行時不採用未收盤的當日 K 棒。
- 需要的 repo secret：`NETLIFY_AUTH_TOKEN`。站台 ID 寫在 workflow 裡。Netlify 上不跑任何建置或函式。

## 實測追蹤

每週收盤後，CI 把當週四份名單（中期／長期的進場與出場，各前 20 檔）寫入 `track/<ISO 週>.json` 並提交；已存在的週不會改寫，Git 歷史即紀錄。之後每次執行都用最新價格計算各名單自凍結日以來的等權平均報酬，對照全體個股與 SPY。只有 CI 會寫入 `track/`。

## 開發

```
npm install
npm run data:build   # 產生 public/data（約 1 分鐘，需連網）
npm run dev          # http://127.0.0.1:5173
npm test
npm run build
```

`LL_CACHE_DIR=某資料夾 npm run data:build` 會把下載的價格存檔重用，方便離線反覆調整。

## 已知限制

- 回測用今日的成分股，已下市或被剔除的公司不在其中，個股的歷史報酬偏高（存活者偏誤）；ETF 的結果不受影響。
- 假設以訊號當週／當月收盤價成交，未計滑價、手續費與稅。
- 規則只看價格，不含財報與估值。
- 「進場候選」的強度門檻是看過第一輪回測後才定的，屬樣本內結果，以實測追蹤驗證。
