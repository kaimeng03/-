# 建築新聞

自架的建築新聞閱讀器，取代 Feedly。整合多個建築新聞來源，並且：

- 點文章可以直接在網站內閱讀「完整內文」，不用跳轉回原網頁（會自動從原文網頁擷取全文，而不是只顯示摘要）
- 原網站需要登入/訂閱、有防機器人驗證，或內文擷取不可靠時，會自動改顯示 RSS 提供的內容並清楚註明，而不是顯示登入頁的垃圾內容
- 所有圖片都透過自己的伺服器轉發（image proxy），避免原本在 Feedly 上圖片破圖的問題
- 文章標題、摘要、內文會自動翻譯成繁體中文；右上角「繁中 / EN」可即時切換介面語言與文章語言，不用重新整理頁面（見下方「翻譯功能」）
- 已讀/未讀、收藏、今日/未讀/已收藏篩選、標題與摘要搜尋（Feedly 常用的晨間閱讀流程）
- 左側可依「資料夾」分類瀏覽不同新聞來源，管理者登入後可以在網站上新增/取消關注網站、新增/刪除分類（見下方「新增新聞來源 / 分類資料夾」）
- 除了 RSS，也支援沒有 RSS 的網站：用「HTML adapter」直接解析該網站的新聞列表頁（目前內建建築師雜誌 `/page_news/` 的 adapter，見 `src/lib/adapters/`）
- 每 15 分鐘自動更新一次文章列表，也可手動按「重新整理」

> 少數網站（目前是 Dezeen、The Architect's Newspaper）有較強的防爬蟲保護，擷取完整內文會失敗，此時會顯示 RSS 內容或摘要並附上原文連結，其餘功能（包含縮圖）不受影響。

## 本機開發

```bash
npm install
npm run dev
```

打開 http://localhost:3000。若要測試「新增/刪除來源」等管理功能，先設定 `ADMIN_PASSWORD`（見下方「管理者登入」）。

## 測試

```bash
npm run lint        # ESLint
npx tsc --noEmit    # TypeScript 型別檢查
npm test            # Vitest 單元測試
npm run build        # 正式 build
```

## 管理者登入

新增網站、新增分類、取消關注來源、刪除分類等會修改資料的功能，都需要先登入管理者身份，避免公開網站被匿名訪客亂改新聞來源清單。

1. 設定環境變數 `ADMIN_PASSWORD`（自訂一組密碼）
2. 「＋ 新增網站」「＋ 新增分類」按鈕，以及每個分類/來源旁的「✕」刪除按鈕，**一直都看得到**（不會因為沒登入就消失）——未登入時點擊會先彈出登入提示，登入成功後自動接續原本要做的動作（例如自動打開「新增網站」表單，或自動重新彈出剛剛要刪除的確認視窗），不用再點第二次
3. 登入狀態存在瀏覽器的 HttpOnly cookie（7 天有效），密碼本身不會被送到瀏覽器可讀取的地方，也不會出現在畫面或程式碼裡
4. 部署到 Vercel 時，管理 API（新增/刪除、登出）還會檢查請求的 `Origin` 是否為本站網址，跨站請求會被擋下（見下方「同源保護 / CSRF」）——記得依說明設定 `NEXT_PUBLIC_SITE_URL`，否則管理功能會全部回傳「跨來源請求已被拒絕」

沒有設定 `ADMIN_PASSWORD` 的話，網站仍可正常閱讀；按下新增/刪除按鈕會清楚顯示「尚未設定管理密碼」的說明，而不是沒有反應。

## 新增新聞來源 / 分類資料夾

左側選單最上方的「＋ 新增網站」按鈕（填網站名稱、RSS 網址或網站首頁網址、選分類）、分類清單最下方的「＋ 新增分類」按鈕，以及每個分類/來源右側的「✕」，任何人都看得到；實際新增/刪除需要先登入管理者（見上一節）。刪除分類時，分類內還有來源的話，會先告知數量，第二次更明確的警告確認後才會連同來源一併刪除（兩個原生 `confirm()` 已改成同一個可鍵盤操作、有清楚取消鍵的自製對話框）。

新增網站時的偵測順序：

1. 先比對是不是已知需要專屬 adapter 的網站（目前是建築師雜誌 `/page_news/`，見下方）——是的話直接用該 adapter 解析，不會嘗試當成 RSS。
2. 不是的話，直接當作 RSS/Atom feed 讀讀看 → 是 HTML 的話找 `<link rel="alternate">` 自動偵測 → 都沒有的話嘗試 `/feed`、`/rss` 等常見路徑。

都沒偵測到的話會清楚顯示「沒有偵測到 RSS/Atom feed」，不會捏造假網址。已經加入過的來源（依網址判斷，會忽略結尾斜線等差異）會被擋下。

**建築師雜誌 `/page_news/` 這個沒有 RSS 的網站，可以直接在「新增網站」欄位貼上它的網址新增**（`https://www.twarchitect.org.tw/page_news/`，有無 `www.`、有無結尾斜線、有沒有帶 `?query`/`#hash` 都能辨識），系統會自動用內建的 adapter 抓取。其他還沒有 RSS 的網站，需要先在 `src/lib/adapters/` 寫一個新的 adapter（並在 `src/lib/adapters/match.ts` 註冊網址判斷規則）才能透過介面新增；沒有對應 adapter 的網站，一般 RSS 流程還是會如常嘗試（多半會提示找不到 RSS/Atom feed）。

這些資料實際存在 [data/sources.json](data/sources.json) 這個檔案裡：

- **本機開發**：直接寫入本機的這個檔案，重新整理就看得到。
- **部署到 Vercel 後**：因為 Vercel 是無狀態的，網站沒辦法自己「寫檔案」，所以新增/刪除功能需要一組有寫入權限的 GitHub Token，讓網站把改動直接 commit 回這個 GitHub repo：

  1. GitHub 右上角頭像 → Settings → 左側 Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
  2. Repository access 選「Only select repositories」，選這個 repo
  3. Permissions → Repository permissions → **Contents** 設成 **Read and write**，其他都不用動
  4. Generate token，複製產生的 token（只會顯示一次）
  5. 在 Vercel 專案的 Settings → Environment Variables，新增：
     - `GITHUB_TOKEN` = 剛剛複製的 token
     - `GITHUB_REPO` = `你的帳號/repo名稱`（例如 `kaimeng03/architecture-news`）
  6. 重新部署（Redeploy）即可生效，之後在網站上新增/刪除的網站、分類都會自動 commit 回這個 repo，手機、電腦看到的是同一份清單。

  沒有設定 `GITHUB_TOKEN` 的話，網站仍然可以用，只是新增/刪除功能會操作失敗（因為沒有地方可以永久儲存）。

本機開發若要測試 GitHub 版本，可以複製 `.env.example` 為 `.env.local` 並填入同樣的值。

### 既有 GitHub `sources.json` 的遷移

如果你在這次更新之前就已經用網站介面新增過分類/來源，GitHub repo 裡的 `data/sources.json` 可能還留著舊版「建築師雜誌」——用 `/feed/` 當 RSS 的那一筆（`id: "twarchitect"`），跟新的 `/page_news/` HTML adapter 那一筆（`id: "twarchitect-news"`）同時存在，側欄會看到兩個幾乎一樣的「建築師雜誌」。處理方式：

1. 打開你 GitHub repo 裡的 `data/sources.json`
2. 找到 `"id": "twarchitect"`、`"feedUrl"` 是 `.../feed/` 的那個物件，整段刪掉（不要刪到 `"id": "twarchitect-news"` 那個，那個是要保留的 HTML adapter 版本）
3. 如果你的 repo 裡根本沒有任何一筆建築師雜誌，也可以直接略過這步，之後用「新增網站」貼 `https://www.twarchitect.org.tw/page_news/` 加回來即可
4. 存檔 commit 後，網站下次重新整理就會生效，不需要重新部署

## 翻譯功能

網站會自動把標題、摘要、內文翻譯成繁體中文。預設使用完全免費、不需註冊的 MyMemory 翻譯 API，但它的免費額度非常小，實測在文章一多時常常會翻譯失敗（此時會直接顯示英文原文，不影響其他功能）。

如果想讓翻譯穩定運作，建議申請 **Microsoft Azure Translator** 免費額度（每月 200 萬字元免費，長期有效，支援繁體中文）：

1. 前往 https://portal.azure.com 註冊/登入（需要信用卡驗證身份，但免費額度內不會扣款）
2. 建立資源 → 搜尋「Translator」→ 建立，Pricing tier 選 **Free F0**
3. 建立完成後，到該資源的「Keys and Endpoint」頁面，複製 KEY 1 和 Region
4. 在 Vercel 專案的 Settings → Environment Variables，新增：
   - `AZURE_TRANSLATOR_KEY` = 剛剛複製的 KEY
   - `AZURE_TRANSLATOR_REGION` = 剛剛複製的 Region（例如 `eastasia`）
5. 重新部署（Redeploy）即可生效

本機開發若要測試，可以複製 `.env.example` 為 `.env.local` 並填入同樣的值。

## 部署到 Vercel（免費）

GitHub repository 已經設定好（`https://github.com/kaimeng03/-.git`），本機的 git remote 也已經指到這裡。以下步驟只需要做一次，之後只要 `git push`，網站就會自動重新部署。

### 1. 把本機程式碼推送上去

在 `site` 資料夾內執行：

```bash
git push -u origin main
```

第一次 push 時，會跳出瀏覽器視窗要你登入 GitHub 授權，登入完成即可。

### 2. 註冊 / 登入 Vercel

前往 https://vercel.com/signup，選擇「Continue with GitHub」，用同一個 GitHub 帳號直接登入，不用再另外設密碼。

### 3. 建立 Vercel 專案並部署

1. 登入 Vercel 後按「Add New...」→「Project」
2. 選擇剛剛推送的 repository → Import
3. Framework Preset 會自動偵測為 Next.js，其他設定不用改
4. 按「Deploy」，等待約 1-2 分鐘

完成後 Vercel 會給你一個網址，手機、電腦都可以直接打開瀏覽，之後每天早上就能取代 Feedly 使用。

想讓「翻譯」「新增/刪除來源」這兩類功能穩定運作，記得照上面「管理者登入」「新增新聞來源 / 分類資料夾」「翻譯功能」「同源保護 / CSRF」四個章節設定對應的環境變數（`ADMIN_PASSWORD`、`GITHUB_TOKEN` + `GITHUB_REPO`、`AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION`、`NEXT_PUBLIC_SITE_URL`）。

之後想更新網站程式碼，只要在本機改完、`git push`，Vercel 就會自動重新部署；新增新聞來源/分類則直接在網站上操作即可，不需要重新部署。

## 同源保護 / CSRF

新增/刪除網站或分類、登出這幾個會修改資料的 API，除了要求管理者登入，也會檢查請求的 `Origin` 是不是本站——不是的話一律擋下（回傳 403），避免其他網站誘導已登入的管理者瀏覽器發出偽造請求。這個檢查刻意不採信請求自帶的 `Host`／`X-Forwarded-Host`（那些可能被上游或客戶端影響），而是跟伺服器自己設定的網址比對：

- 部署在 Vercel 時，`VERCEL_PROJECT_PRODUCTION_URL`／`VERCEL_URL` 由 Vercel 自動提供，一般不用手動設定。
- 想確保萬無一失，或使用自訂網域，建議額外設定 `NEXT_PUBLIC_SITE_URL`（例如 `https://architecture-news.vercel.app` 或你的自訂網域），設定後以此為準。
- 本機開發環境（`npm run dev`）固定允許 `http://localhost:3000`，不需要另外設定。
- 都沒有比對到的話，管理 API 會回傳「跨來源請求已被拒絕」（403）——這是刻意的安全預設（fail closed），不是 bug；照上面設定 `NEXT_PUBLIC_SITE_URL` 即可解決。

## 已知限制

- MyMemory 免費翻譯額度很小，未設定 Azure Translator 時常見翻譯失敗（自動退回顯示英文原文，不影響其他功能）。
- Dezeen、The Architect's Newspaper 有較強的防爬蟲保護，完整內文擷取常失敗，會自動退回顯示 RSS 內容或摘要。
- 少數 ArchDaily 文章的擷取內容開頭會混入一小段網站自身的 UI 文字（例如影片長度標籤、「Subscriber Access」小標籤），實際文章全文仍完整可讀，屬於次要的內容擷取雜訊，非登入牆阻擋。
- Rate limit（新增/刪除、登入、重新整理）採記憶體內計數，僅在單一伺服器執行個體內有效；在 Vercel 這類多執行個體/會冷啟動的環境下是盡力而為的防護，非嚴格保證。
- 網站介面可以新增任何 RSS/Atom 來源，以及已經寫好 adapter 並在 `src/lib/adapters/match.ts` 註冊網址規則的 HTML 來源（目前是建築師雜誌 `/page_news/`）；其他還沒有 RSS 且沒有對應 adapter 的網站，需要先寫程式加上專屬 adapter，無法單純透過介面新增。
- CSRF 的 Origin 檢查沒有另外做 CSRF token 機制，改以 `SameSite=Lax` cookie 搭配 Origin 比對作為主要防禦；這是現代瀏覽器下被廣泛接受的做法，但不是雙重保險。
