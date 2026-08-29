# 建築新聞

自架的建築新聞閱讀器，取代 Feedly。整合 ArchDaily、Dezeen、designboom、Architizer、The Architect's Newspaper 五個來源的 RSS，並且：

- 點文章可以直接在網站內閱讀「完整內文」，不用跳轉回原網頁（會自動從原文網頁擷取全文，而不是只顯示摘要）
- 所有圖片都透過自己的伺服器轉發（image proxy），避免原本在 Feedly 上圖片破圖的問題
- 每 15 分鐘自動更新一次文章列表

> 少數網站（目前是 Dezeen、The Architect's Newspaper）有較強的防爬蟲保護，擷取完整內文會失敗，此時會顯示摘要並附上原文連結，其餘功能（包含縮圖）不受影響。

## 本機開發

```bash
npm install
npm run dev
```

打開 http://localhost:3000

## 新增/修改新聞來源

編輯 [src/lib/sources.ts](src/lib/sources.ts)，加入新的 RSS feed 網址即可。

## 部署到 Vercel（免費）

以下步驟只需要做一次，之後只要 `git push`，網站就會自動重新部署。

### 1. 註冊 GitHub 帳號

前往 https://github.com/signup 完成註冊（如果已經有帳號可跳過）。

### 2. 建立一個新的 GitHub repository

1. 登入 GitHub 後，右上角「+」→「New repository」
2. Repository name 填 `architecture-news`（或任意名稱）
3. 設定 Public 或 Private 皆可
4. 不要勾選 "Add a README file"（本地已經有專案了）
5. 按「Create repository」，會看到一個空 repo 的網址，例如：
   `https://github.com/<你的帳號>/architecture-news.git`

### 3. 把本機程式碼推送上去

在 `site` 資料夾內執行（把網址換成你自己剛建立的那個）：

```bash
git remote add origin https://github.com/<你的帳號>/architecture-news.git
git branch -M main
git push -u origin main
```

第一次 push 時，Windows 會跳出視窗要你用瀏覽器登入 GitHub 授權，照著做即可。

### 4. 註冊 / 登入 Vercel

前往 https://vercel.com/signup，選擇「Continue with GitHub」，用剛剛的 GitHub 帳號直接登入，不用再另外設密碼。

### 5. 建立 Vercel 專案並部署

1. 登入 Vercel 後按「Add New...」→「Project」
2. 選擇剛剛建立的 `architecture-news` repository → Import
3. Framework Preset 會自動偵測為 Next.js，其他設定不用改
4. 按「Deploy」，等待約 1-2 分鐘

完成後 Vercel 會給你一個網址（例如 `architecture-news.vercel.app`），手機、電腦都可以直接打開瀏覽，之後每天早上就能取代 Feedly 使用。

之後想更新網站內容或新增新聞來源，只要在本機改完程式碼、`git push`，Vercel 就會自動重新部署。
