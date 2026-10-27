# プライバシーポリシー / Privacy Policy

Assist for moodle+R（以下「本拡張機能」）

## 日本語

本拡張機能は、立命館大学の LMS「moodle+R」をパソコンで使いやすくするための非公式の拡張機能です。立命館大学とは関係ありません。

### 収集・送信する情報
本拡張機能は、利用者の情報を収集しません。また、本拡張機能が読み取った内容（ページの内容、教材、授業の情報など）を、作者や第三者のサーバーを含む外部へ送信することはありません。外部からプログラムを読み込んで実行することもありません。

### ブラウザ内に保存する情報
次の6つの情報だけを、利用者のブラウザ内（`chrome.storage.local`）に保存します。これらはブラウザの外に送信されません。

1. 一度開いた授業のシラバスの URL（次回から検索せずにすぐ開くため）
2. 時間割に表示される授業と授業コードの対応（授業のページにシラバスボタンを表示するため）
3. 利用者が選んだ表示の設定（「標準」か「ワイド」か）
4. 教材ダウンロードの設定（フォルダを作るかどうか）
5. タイムラインで非表示にした課題（課題名・科目名・非表示にした日時。半年たつと自動で消えます）
6. 教材を保存するときに利用者が付けた、科目ごと・回ごとのフォルダ名

氏名、学籍番号、成績、教材の内容などは保存しません。

### 権限の使い道
- **downloads**: 利用者が選んだ教材を、科目・授業回ごとのフォルダに分けて保存するためだけに使います。本拡張機能が始めたダウンロード以外には関与しません。
- **storage**: 上の6つの情報をブラウザ内に保存するために使います。
- **サイトへのアクセス**: `lms.ritsumei.ac.jp`（moodle+R）と `syllabus.ritsumei.ac.jp/syllabus/s/`（オンラインシラバス）でだけ動作し、画面の表示を変えたり、ボタンを追加したりします。

### 情報の削除
本拡張機能を削除（アンインストール）すると、ブラウザ内に保存された情報もすべて削除されます。

### 変更
このポリシーを変更する場合は、このページを更新します。

---

## English

This extension is an unofficial tool that makes moodle+R, the LMS of Ritsumeikan University, easier to use on a PC. It is not affiliated with Ritsumeikan University.

### Data collection and transmission
The extension does not collect any user data. Nothing it reads (page contents, course materials, course information, etc.) is sent to any external server, including servers of the author or third parties. No remotely hosted code is loaded or executed.

### Data stored in the browser
Only the following six items are stored locally in the user's browser (`chrome.storage.local`). They never leave the browser.

1. URLs of syllabus pages the user has opened (to open them instantly next time)
2. The mapping between courses and course codes shown in the user's timetable (to show the syllabus button on course pages)
3. The user's layout choice ("standard" or "wide")
4. The user's download setting (whether to create folders)
5. Timeline items the user chose to hide (item name, course name and when it was hidden; removed automatically after six months)
6. Folder names the user set for each course and each week when saving materials

Names, student IDs, grades and the contents of course materials are not stored.

### How permissions are used
- **downloads**: only to save the course materials the user selected into course/session folders. Downloads not started by the extension are not affected.
- **storage**: only to store the six items above in the browser.
- **Site access**: the extension runs only on `lms.ritsumei.ac.jp` (moodle+R) and `syllabus.ritsumei.ac.jp/syllabus/s/` (online syllabus), where it adjusts the layout and adds buttons.

### Deleting data
Removing (uninstalling) the extension deletes all data it stored in the browser.

### Changes
If this policy changes, this page will be updated.
