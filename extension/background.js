// 教材の一括ダウンロード（materials-download.js から依頼を受けて保存する）。
// ダイアログを閉じても保存は続き、残り件数を拡張機能アイコンのバッジに表示する。
// chrome.downloads はコンテンツスクリプトから使えないため、この service worker で行う。
// 保存先: ダウンロード/<item.folders をつないだフォルダ>/<サーバーが付けた元のファイル名>
//   フォルダの並びは materials-download.js が選んだ件数と回に応じて決める（空ならフォルダを作らない）

const ITEM_TIMEOUT_MS = 5 * 60 * 1000;

// 初めてインストールしたときだけ、使い始めの案内ページを開く（更新のときは開かない）
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// いま保存中の1件（1件ずつ順番に保存するので、ファイル名の振り分けはこれを見ればよい）
let current = null;

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  // この拡張機能が始めたダウンロード以外には手を出さない
  if (!current || item.byExtensionId !== chrome.runtime.id) {
    suggest();
    return;
  }
  const file = safeName(item.filename, 'file');
  suggest({ filename: current.dir ? `${current.dir}/${file}` : file, conflictAction: 'uniquify' });
});

// フォルダ名・ファイル名に使えない文字を取り除く（Windows 基準）
function safeName(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) || cleaned === '' ? fallback : cleaned;
}

const waitForEnd = (id) => new Promise((resolve) => {
  const timer = setTimeout(() => finish(false), ITEM_TIMEOUT_MS);
  function finish(ok) {
    clearTimeout(timer);
    chrome.downloads.onChanged.removeListener(onChanged);
    resolve(ok);
  }
  function onChanged(delta) {
    if (delta.id !== id || !delta.state) {
      return;
    }
    if (delta.state.current === 'complete') {
      finish(true);
    } else if (delta.state.current === 'interrupted') {
      finish(false);
    }
  }
  chrome.downloads.onChanged.addListener(onChanged);
});

const downloadOne = async (item) => {
  const folders = (Array.isArray(item.folders) ? item.folders : []).map((s) => safeName(s, 'folder'));
  current = { dir: folders.join('/') };
  try {
    const id = await chrome.downloads.download({ url: item.url, saveAs: false, conflictAction: 'uniquify' });
    if (!(await waitForEnd(id))) {
      return false;
    }
    // ファイル本体ではなく Moodle の画面を保存してしまった場合は、消して失敗扱いにする
    //   - ログイン切れ: ログイン画面へ転送されている
    //   - 編集権限のある科目（教員・TA）: 「ファイル」の redirect=1 が効かず、教材の画面のまま
    const [saved] = await chrome.downloads.search({ id });
    const finalUrl = (saved && saved.finalUrl) || '';
    if (/\/login\/index\.php/.test(finalUrl) || /\/mod\/resource\/view\.php/.test(finalUrl)) {
      await chrome.downloads.removeFile(id).catch(() => {});
      await chrome.downloads.erase({ id }).catch(() => {});
      return false;
    }
    return true;
  } catch (e) {
    return false;
  } finally {
    current = null;
  }
};

// ---- 保存の順番待ち ----
// ダイアログを閉じたり、ページを移動・タブを閉じたりしても、依頼された教材は最後まで保存する。
// 止めるのはダイアログの「中止」ボタン（cancel）だけ。
// job = { total, done, failed: [名前], port: 進み具合の送り先（ダイアログが閉じたら null）, cancelled }
const queue = []; // { job, item }
let running = false;
let keepAlive = null;

const post = (job, type) => {
  if (!job.port || job.cancelled) {
    return;
  }
  try {
    job.port.postMessage({ type, done: job.done, total: job.total, failed: job.failed });
  } catch (e) {
    // ダイアログ側が閉じた直後（切断の通知がまだ届いていない）。保存は止めずに送り先だけ外す
    job.port = null;
  }
};

// 拡張機能アイコンのバッジに残り件数を出す（ダイアログを閉じた後も進み具合が分かるように）
const updateBadge = (text, color, title) => {
  chrome.action.setBadgeBackgroundColor({ color: color || '#ac413d' });
  chrome.action.setBadgeText({ text });
  chrome.action.setTitle({ title: title || 'Assist for moodle+R' });
};

const run = async () => {
  running = true;
  // service worker は何もしない時間が続くと止められるので、保存中は定期的に API を呼んで動かし続ける
  keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20 * 1000);
  const failedAll = [];
  while (queue.length > 0) {
    const remaining = queue.length;
    updateBadge(String(remaining), '#ac413d', `教材を保存しています（残り ${remaining} 件）`);
    const { job, item } = queue.shift();
    if (job.cancelled) {
      continue;
    }
    const ok = await downloadOne(item);
    job.done += 1;
    if (!ok) {
      job.failed.push(item.name);
      failedAll.push(item.name);
    }
    post(job, job.done === job.total ? 'done' : 'progress');
  }
  clearInterval(keepAlive);
  running = false;
  if (failedAll.length > 0) {
    updateBadge('!', '#b02a37', `保存できなかった教材: ${failedAll.join('、')}`);
  } else {
    updateBadge('✓', '#2e7d32', '教材の保存が終わりました');
    setTimeout(() => {
      if (!running) {
        updateBadge('');
      }
    }, 10 * 1000);
  }
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'materials-download') {
    return;
  }
  let job = null;
  // ダイアログが閉じても保存は続ける（進み具合の送り先がなくなるだけ）
  port.onDisconnect.addListener(() => {
    if (job) {
      job.port = null;
    }
  });

  port.onMessage.addListener((msg) => {
    if (msg?.type === 'start' && Array.isArray(msg.items) && !job) {
      job = { total: msg.items.length, done: 0, failed: [], port, cancelled: false };
      queue.push(...msg.items.map((item) => ({ job, item })));
      if (!running) {
        run();
      }
    } else if (msg?.type === 'cancel' && job) {
      // 保存中の1件は最後まで保存し、まだ始めていない教材を取りやめる
      job.cancelled = true;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].job === job) {
          queue.splice(i, 1);
        }
      }
      port.postMessage({ type: 'cancelled', done: job.done, total: job.total, failed: job.failed });
    }
  });
});
