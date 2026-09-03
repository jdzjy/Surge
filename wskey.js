/**
 * 1、打开App，自动获取 wskey 上传
 * 2、点击APP-个人中心，点消息，自动捕抓 wskey 上传
 * 注：如有变更才会上传，如果 wskey 没变，不会重复上传。
 * 使用前请在 BoxJs 的“Telegram 通用配置”中填写 Bot Token 和 User ID。
 */

const $ = new Env('♨️上传 wskey');
const requestHeaders =
  typeof $request !== 'undefined' && $request.headers ? $request.headers : {};
const responseHeaders =
  typeof $response !== 'undefined' && $response.headers ? $response.headers : {};
const requestBody =
  typeof $request !== 'undefined' ? String($request.body || '') : '';
const responseBody =
  typeof $response !== 'undefined' ? String($response.body || '') : '';
const requestUrl =
  typeof $request !== 'undefined' ? String($request.url || '') : '';
const isTargetRequest = /^(?:https?:\/\/sh\.jd\.com\/d(?:[\/?#]|$)|https?:\/\/sso\.jd\.com\/appJdst\/update(?:[\/?#]|$))/i.test(
  requestUrl
);
const requestHeaderText = stringifyHeaders(requestHeaders);
const responseHeaderText = stringifyHeaders(responseHeaders);
const allHeaderText = [requestHeaderText, responseHeaderText]
  .filter(Boolean)
  .join('\n');
const requestCookie = getHeaderValue(requestHeaders, 'cookie');
const responseCookie = getHeaderValue(responseHeaders, 'set-cookie');
const allCookies = [requestCookie, responseCookie, allHeaderText]
  .filter(Boolean)
  .join('; ');

// 新版 sh.jd.com/d 请求会直接把 wskey 放在 Cookie 中，但通常没有 pt_pin。
// 先从当前请求读取 pt_pin；没有时，按 pin_hash 使用此前缓存的 pt_pin。
const directPin =
  getCookieValue(allCookies, 'pt_pin') || getCookieValue(allCookies, 'pin');
const pinHash = getCookieValue(allCookies, 'pin_hash');
const configuredPin = String($.getData('jdzjy_JDPin') || '').trim();
let pin = directPin || getCachedPin(pinHash) || configuredPin;
let key = getCookieValue(allCookies, 'wskey');

if (directPin) {
  rememberPin(directPin, pinHash);
}

// 兼容旧版 appJdst/update：从请求体或响应体递归查找 sessionTicket/wskey。
key =
  key ||
  findCredential(requestBody) ||
  findCredential(responseBody) ||
  findCredential(allHeaderText);
// api.m.jd.com/sso.jd.com 的匹配规则仅用于缓存 pt_pin，不能触发 wskey 通知。
if (!isTargetRequest) {
  key = '';
}

const _TGBotToken = String($.getData('jdzjy_TGBotToken') || '').trim();
const _TGUserID = String($.getData('jdzjy_TGUserID') || '').trim();

$.TGBotToken = _TGBotToken;
$.TGUserIDs = _TGUserID
  .split(/[\s,]+/)
  .map((userId) => userId.trim())
  .filter((userId, index, userIds) =>
    userId && userIds.indexOf(userId) === index
  );

!(async () => {
  if (!key) {
    // 仅用于缓存 pt_pin 的请求不需要提示。
    return;
  }

  if (!pin) {
    const pinTip =
      '已找到 wskey，但没有匹配的 pt_pin；请先重新打开京东首页后再试';
    // 缺少 pt_pin 时不弹通知，避免每次 sh.jd.com 请求重复打扰。
    console.log(`⚠️ ${pinTip}`);
    return;
  }

  try {
    const accountKey = pin;
    const cookie = `pt_pin=${pin};wskey=${key};`;
    const userName = pin;
    const decodeName = safeDecodeURIComponent(userName);
    let cookiesData = parseStoredList($.getData('wskeyList'));
    
    let updateIndex;
    let cookieName = '【账号】';
    const existCookie = cookiesData.find((item, index) => {
      const ck = item.cookie || '';
      const itemKey =
        item.accountKey ||
        getCookieValue(ck, 'pt_pin') ||
        getCookieValue(ck, 'pin') ||
        getCookieValue(ck, 'pin_hash') ||
        getCookieValue(ck, 'wskey');
      const verify = accountKey === itemKey;
      if (verify) {
        updateIndex = index;
        if (ck !== cookie) {
          $.needUpload = true;
        }
      }
      return verify;
    });

    // 完整 Cookie 未变化：不写回、不发送 Telegram，只弹一次本地通知。
    if (existCookie && cookiesData[updateIndex].cookie === cookie) {
      $.resData = 'wskey 没有变化，无需上传';
      console.log('♨️wskey 没有改变');
      await showMsg();
      return;
    }

    if (!$.TGBotToken || $.TGUserIDs.length === 0) {
      const configTip = '请先在 BoxJs 的“Telegram 通用配置”中填写 Bot Token 和 User ID';
      console.log(`⚠️ ${configTip}`);
      $.msg($.name, '', configTip);
      return;
    }

    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test($.TGBotToken)) {
      const tokenTip = 'Bot Token 格式不正确：请只粘贴 BotFather 提供的 Token';
      console.log(`⚠️ ${tokenTip}`);
      $.msg($.name, '', tokenTip);
      return;
    }
    
    let tipPrefix = '';
    if (existCookie) {
      cookiesData[updateIndex].cookie = cookie;
      cookieName = '【账号' + (updateIndex + 1) + '】';
      tipPrefix = '更新京东 wskey';
    } else {
      cookiesData.push({
        userName: decodeName,
        accountKey,
        cookie: cookie,
      });
      cookieName = '【账号' + cookiesData.length + '】';
      tipPrefix = '首次写入京东 wskey';
      $.needUpload = true;
    }
    
    if ($.needUpload) {
      $.setData(JSON.stringify(cookiesData, null, 2), 'wskeyList');
      for (const userId of $.TGUserIDs) {
        await updateCookie(cookie, userId);
      }
      // 无论配置了几个 Chat ID，同一份变化只通知一次。
      await showMsg();
    }

    return;
  } catch (error) {
    $.msg('写入京东 wskey 失败', '', '请重试 ⚠️');
    console.log(`\n写入京东 wskey 出现错误 ‼️\n${error}\n`);
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done());

function getHeaderValue(headers, name) {
  const key = Object.keys(headers || {}).find(
    (item) => item.toLowerCase() === name.toLowerCase()
  );
  if (!key) return '';
  return stringifyHeaderValue(headers[key]);
}

function getCookieValue(cookieText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = String(cookieText || '');
  if (!text) return '';

  const direct = text
    .split(/;\s*/)
    .map((item) => item.trim())
    .find((item) => new RegExp(`^${escaped}\\s*=`, 'i').test(item));
  if (direct) {
    return cleanCookieValue(direct.replace(new RegExp(`^${escaped}\\s*=`, 'i'), ''));
  }

  const match = text.match(
    new RegExp(`(?:^|[;,\\s"'([{])${escaped}\\s*=\\s*([^;,\\s)"'\\\\}]+)`, 'i')
  );
  return match ? cleanCookieValue(match[1]) : '';
}

function findCredential(raw) {
  if (!raw) return '';
  const sources = uniqueTexts([String(raw), safeDecodeURIComponent(String(raw))]);
  const find = (value) => {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = find(item);
        if (result) return result;
      }
      return '';
    }
    for (const [name, item] of Object.entries(value)) {
      if (
        /^(sessionTicket|wskey)$/i.test(name) &&
        typeof item === 'string' &&
        item
      ) {
        return item;
      }
      const result = find(item);
      if (result) return result;
    }
    return '';
  };
  for (const source of sources) {
    try {
      const result = find(JSON.parse(source));
      if (result) return result;
    } catch (_) {
      // 请求体可能是 URL 编码或非 JSON，继续使用正则兜底。
    }
    const cookieValue = getCookieValue(source, 'wskey');
    if (cookieValue) return cookieValue;

    const match = source.match(
      /["']?(sessionTicket|wskey)["']?\s*[:=]\s*["']?([^"'&,;\s}]+)/i
    );
    if (match) return cleanCookieValue(match[2]);
  }
  return '';
}

function stringifyHeaders(headers) {
  return Object.entries(headers || {})
    .map(([name, value]) => `${name}: ${stringifyHeaderValue(value)}`)
    .join('\n');
}

function stringifyHeaderValue(value) {
  if (Array.isArray(value)) return value.map(stringifyHeaderValue).join('; ');
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }
  return String(value || '');
}

function cleanCookieValue(value) {
  return String(value || '')
    .trim()
    .replace(/^\\?["']|\\?["']$/g, '');
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function uniqueTexts(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function getCachedPin(pinHash) {
  try {
    const cache = JSON.parse($.getData('jdzjy_PinCache') || '{}');
    if (!cache.pin) return '';
    if (pinHash && cache.pinHash === pinHash) return cache.pin;
    if (!pinHash && !cache.pinHash) return cache.pin;
  } catch (_) {
    // 忽略损坏的缓存，等待下一次带 pt_pin 的请求重新建立。
  }
  return '';
}

function rememberPin(pin, pinHash) {
  if (!pin) return;
  const next = { pin, pinHash: pinHash || '' };
  try {
    const current = JSON.parse($.getData('jdzjy_PinCache') || '{}');
    if (
      current &&
      current.pin === next.pin &&
      (current.pinHash || '') === next.pinHash
    ) {
      return;
    }
  } catch (_) {
    // 忽略损坏的缓存，下面直接用当前值覆盖。
  }
  $.setData(JSON.stringify(next), 'jdzjy_PinCache');
}

function parseStoredList(raw) {
  try {
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function logRequestContext(headers) {
  const url = typeof $request !== 'undefined' ? String($request.url || '') : '';
  const urlInfo = getSafeUrlInfo(url);
  const headerNames = Object.keys(headers || {}).join(', ') || '无';
  if (urlInfo) console.log(`当前命中 URL：${urlInfo}`);
  console.log(`已读取请求头字段：${headerNames}`);
}

function getSafeUrlInfo(url) {
  if (!url) return '';
  const match = url.match(/^(https?:\/\/[^/?#]+)(\/[^?#]*)?/i);
  return match ? `${match[1]}${match[2] || '/'}` : '';
}

function updateCookie(cookie, TGUserID) {
  return new Promise((resolve) => {
    const opts = {
      url: `https://api.telegram.org/bot${$.TGBotToken}/sendMessage`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `chat_id=${TGUserID}&text=${encodeURIComponent(cookie)}&disable_web_page_preview=true`,
    };

    $.post(opts, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`);
        } else {
          data = JSON.parse(data);
          if (data.ok) {
            console.log('已通过 Telegram Bot 发送 wskey 🎉\n');
            $.resData = '已通过 Telegram Bot 发送 wskey 🎉';
          } else if (data.error_code === 400) {
            console.log('Telegram User ID/Chat ID 无效，或机器人无权发送。\n');
            $.resData = 'Telegram User ID/Chat ID 无效，或机器人无权发送。';
          } else if (data.error_code === 401) {
            console.log('Telegram Bot Token 无效或已被撤销，请检查 BoxJs 通用配置。\n');
            $.resData = 'Telegram Bot Token 无效或已被撤销，请检查 BoxJs 通用配置。';
          }
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    });
  });
}

function showMsg() {
  return new Promise((resolve) => {
    $.msg($.name, $.subt, $.resData || '服务不可用');
    resolve();
  });
}

// https://github.com/chavyleung/scripts/blob/master/Env.js
// prettier-ignore
function Env(name, opts) {
  class Http {
    constructor(env) {
      this.env = env;
    }

    send(opts, method = 'GET') {
      opts = typeof opts === 'string' ? { url: opts } : opts;
      let sender = this.get;
      if (method === 'POST') {
        sender = this.post;
      }
      return new Promise((resolve, reject) => {
        sender.call(this, opts, (err, resp, body) => {
          if (err) reject(err);
          else resolve(resp);
        });
      });
    }

    get(opts) {
      return this.send.call(this.env, opts);
    }

    post(opts) {
      return this.send.call(this.env, opts, 'POST');
    }
  }

  return new (class {
    constructor(name, opts) {
      this.name = name;
      this.http = new Http(this);
      this.data = null;
      this.dataFile = 'box.dat';
      this.logs = [];
      this.isMute = false;
      this.isNeedRewrite = false;
      this.logSeparator = '\n';
      this.startTime = new Date().getTime();
      Object.assign(this, opts);
      this.log('', `🔔${this.name}, 开始!`);
    }

    isNode() {
      return 'undefined' !== typeof module && !!module.exports;
    }

    isQuanX() {
      return 'undefined' !== typeof $task;
    }

    isSurge() {
      return 'undefined' !== typeof $httpClient && 'undefined' === typeof $loon;
    }

    isLoon() {
      return 'undefined' !== typeof $loon;
    }

    isShadowrocket() {
      return 'undefined' !== typeof $rocket;
    }

    toObj(str, defaultValue = null) {
      try {
        return JSON.parse(str);
      } catch {
        return defaultValue;
      }
    }

    toStr(obj, defaultValue = null) {
      try {
        return JSON.stringify(obj);
      } catch {
        return defaultValue;
      }
    }

    getJson(key, defaultValue) {
      let json = defaultValue;
      const val = this.getData(key);
      if (val) {
        try {
          json = JSON.parse(this.getData(key));
        } catch {}
      }
      return json;
    }

    setJson(val, key) {
      try {
        return this.setData(JSON.stringify(val), key);
      } catch {
        return false;
      }
    }

    getScript(url) {
      return new Promise((resolve) => {
        this.get({ url }, (err, resp, body) => resolve(body));
      });
    }

    runScript(script, runOpts) {
      return new Promise((resolve) => {
        let httpApi = this.getData('@chavy_boxjs_userCfgs.httpApi');
        httpApi = httpApi ? httpApi.replace(/\n/g, '').trim() : httpApi;
        let httpApi_timeout = this.getData(
          '@chavy_boxjs_userCfgs.httpApi_timeout'
        );
        httpApi_timeout = httpApi_timeout ? httpApi_timeout * 1 : 20;
        httpApi_timeout =
          runOpts && runOpts.timeout ? runOpts.timeout : httpApi_timeout;
        const [key, addr] = httpApi.split('@');
        const opts = {
          url: `http://${addr}/v1/scripting/evaluate`,
          body: {
            script_text: script,
            mock_type: 'cron',
            timeout: httpApi_timeout,
          },
          headers: { 'X-Key': key, Accept: '*/*' },
        };
        this.post(opts, (err, resp, body) => resolve(body));
      }).catch((e) => this.logErr(e));
    }

    loadData() {
      if (this.isNode()) {
        this.fs = this.fs ? this.fs : require('fs');
        this.path = this.path ? this.path : require('path');
        const curDirDataFilePath = this.path.resolve(this.dataFile);
        const rootDirDataFilePath = this.path.resolve(
          process.cwd(),
          this.dataFile
        );
        const isCurDirDataFile = this.fs.existsSync(curDirDataFilePath);
        const isRootDirDataFile =
          !isCurDirDataFile && this.fs.existsSync(rootDirDataFilePath);
        if (isCurDirDataFile || isRootDirDataFile) {
          const datPath = isCurDirDataFile
            ? curDirDataFilePath
            : rootDirDataFilePath;
          try {
            return JSON.parse(this.fs.readFileSync(datPath));
          } catch (e) {
            return {};
          }
        } else return {};
      } else return {};
    }

    writeData() {
      if (this.isNode()) {
        this.fs = this.fs ? this.fs : require('fs');
        this.path = this.path ? this.path : require('path');
        const curDirDataFilePath = this.path.resolve(this.dataFile);
        const rootDirDataFilePath = this.path.resolve(
          process.cwd(),
          this.dataFile
        );
        const isCurDirDataFile = this.fs.existsSync(curDirDataFilePath);
        const isRootDirDataFile =
          !isCurDirDataFile && this.fs.existsSync(rootDirDataFilePath);
        const jsonData = JSON.stringify(this.data);
        if (isCurDirDataFile) {
          this.fs.writeFileSync(curDirDataFilePath, jsonData);
        } else if (isRootDirDataFile) {
          this.fs.writeFileSync(rootDirDataFilePath, jsonData);
        } else {
          this.fs.writeFileSync(curDirDataFilePath, jsonData);
        }
      }
    }

    lodash_get(source, path, defaultValue = undefined) {
      const paths = path.replace(/\[(\d+)\]/g, '.$1').split('.');
      let result = source;
      for (const p of paths) {
        result = Object(result)[p];
        if (result === undefined) {
          return defaultValue;
        }
      }
      return result;
    }

    lodash_set(obj, path, value) {
      if (Object(obj) !== obj) return obj;
      if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
      path
        .slice(0, -1)
        .reduce(
          (a, c, i) =>
            Object(a[c]) === a[c]
              ? a[c]
              : (a[c] = Math.abs(path[i + 1]) >> 0 === +path[i + 1] ? [] : {}),
          obj
        )[path[path.length - 1]] = value;
      return obj;
    }

    getData(key) {
      let val = this.getVal(key);
      if (/^@/.test(key)) {
        const [, objKey, paths] = /^@(.*?)\.(.*?)$/.exec(key);
        const objVal = objKey ? this.getVal(objKey) : '';
        if (objVal) {
          try {
            const objedVal = JSON.parse(objVal);
            val = objedVal ? this.lodash_get(objedVal, paths, '') : val;
          } catch (e) {
            val = '';
          }
        }
      }
      return val;
    }

    setData(val, key) {
      let isSuc = false;
      if (/^@/.test(key)) {
        const [, objKey, paths] = /^@(.*?)\.(.*?)$/.exec(key);
        const objdat = this.getVal(objKey);
        const objVal = objKey
          ? objdat === 'null'
            ? null
            : objdat || '{}'
          : '{}';
        try {
          const objedVal = JSON.parse(objVal);
          this.lodash_set(objedVal, paths, val);
          isSuc = this.setVal(JSON.stringify(objedVal), objKey);
        } catch (e) {
          const objedVal = {};
          this.lodash_set(objedVal, paths, val);
          isSuc = this.setVal(JSON.stringify(objedVal), objKey);
        }
      } else {
        isSuc = this.setVal(val, key);
      }
      return isSuc;
    }

    getVal(key) {
      if (this.isSurge() || this.isLoon()) {
        return $persistentStore.read(key);
      } else if (this.isQuanX()) {
        return $prefs.valueForKey(key);
      } else if (this.isNode()) {
        this.data = this.loadData();
        return this.data[key];
      } else {
        return (this.data && this.data[key]) || null;
      }
    }

    setVal(val, key) {
      if (this.isSurge() || this.isLoon()) {
        return $persistentStore.write(val, key);
      } else if (this.isQuanX()) {
        return $prefs.setValueForKey(val, key);
      } else if (this.isNode()) {
        this.data = this.loadData();
        this.data[key] = val;
        this.writeData();
        return true;
      } else {
        return (this.data && this.data[key]) || null;
      }
    }

    initGotEnv(opts) {
      this.got = this.got ? this.got : require('got');
      this.ckTough = this.ckTough ? this.ckTough : require('tough-cookie');
      this.ckJar = this.ckJar ? this.ckJar : new this.ckTough.CookieJar();
      if (opts) {
        opts.headers = opts.headers ? opts.headers : {};
        if (undefined === opts.headers.Cookie && undefined === opts.cookieJar) {
          opts.cookieJar = this.ckJar;
        }
      }
    }

    get(opts, callback = () => {}) {
      if (opts.headers) {
        delete opts.headers['Content-Type'];
        delete opts.headers['Content-Length'];
      }
      if (this.isSurge() || this.isLoon()) {
        if (this.isSurge() && this.isNeedRewrite) {
          opts.headers = opts.headers || {};
          Object.assign(opts.headers, { 'X-Surge-Skip-Scripting': false });
        }
        $httpClient.get(opts, (err, resp, body) => {
          if (!err && resp) {
            resp.body = body;
            resp.statusCode = resp.status;
          }
          callback(err, resp, body);
        });
      } else if (this.isQuanX()) {
        if (this.isNeedRewrite) {
          opts.opts = opts.opts || {};
          Object.assign(opts.opts, { hints: false });
        }
        $task.fetch(opts).then(
          (resp) => {
            const { statusCode: status, statusCode, headers, body } = resp;
            callback(null, { status, statusCode, headers, body }, body);
          },
          (err) => callback(err)
        );
      } else if (this.isNode()) {
        this.initGotEnv(opts);
        this.got(opts)
          .on('redirect', (resp, nextOpts) => {
            try {
              if (resp.headers['set-cookie']) {
                const ck = resp.headers['set-cookie']
                  .map(this.ckTough.Cookie.parse)
                  .toString();
                if (ck) {
                  this.ckJar.setCookieSync(ck, null);
                }
                nextOpts.cookieJar = this.ckJar;
              }
            } catch (e) {
              this.logErr(e);
            }
          })
          .then(
            (resp) => {
              const { statusCode: status, statusCode, headers, body } = resp;
              callback(null, { status, statusCode, headers, body }, body);
            },
            (err) => {
              const { message: error, response: resp } = err;
              callback(error, resp, resp && resp.body);
            }
          );
      }
    }

    post(opts, callback = () => {}) {
      const method = opts.method ? opts.method.toLocaleLowerCase() : 'post';
      if (opts.body && opts.headers && !opts.headers['Content-Type']) {
        opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      if (opts.headers) delete opts.headers['Content-Length'];
      if (this.isSurge() || this.isLoon()) {
        if (this.isSurge() && this.isNeedRewrite) {
          opts.headers = opts.headers || {};
          Object.assign(opts.headers, { 'X-Surge-Skip-Scripting': false });
        }
        $httpClient[method](opts, (err, resp, body) => {
          if (!err && resp) {
            resp.body = body;
            resp.statusCode = resp.status;
          }
          callback(err, resp, body);
        });
      } else if (this.isQuanX()) {
        opts.method = method;
        if (this.isNeedRewrite) {
          opts.opts = opts.opts || {};
          Object.assign(opts.opts, { hints: false });
        }
        $task.fetch(opts).then(
          (resp) => {
            const { statusCode: status, statusCode, headers, body } = resp;
            callback(null, { status, statusCode, headers, body }, body);
          },
          (err) => callback(err)
        );
      } else if (this.isNode()) {
        this.initGotEnv(opts);
        const { url, ..._opts } = opts;
        this.got[method](url, _opts).then(
          (resp) => {
            const { statusCode: status, statusCode, headers, body } = resp;
            callback(null, { status, statusCode, headers, body }, body);
          },
          (err) => {
            const { message: error, response: resp } = err;
            callback(error, resp, resp && resp.body);
          }
        );
      }
    }
    
    time(fmt, ts = null) {
      const date = ts ? new Date(ts) : new Date();
      let o = {
        'M+': date.getMonth() + 1,
        'd+': date.getDate(),
        'H+': date.getHours(),
        'm+': date.getMinutes(),
        's+': date.getSeconds(),
        'q+': Math.floor((date.getMonth() + 3) / 3),
        S: date.getMilliseconds(),
      };
      if (/(y+)/.test(fmt))
        fmt = fmt.replace(
          RegExp.$1,
          (date.getFullYear() + '').substr(4 - RegExp.$1.length)
        );
      for (let k in o)
        if (new RegExp('(' + k + ')').test(fmt))
          fmt = fmt.replace(
            RegExp.$1,
            RegExp.$1.length == 1
              ? o[k]
              : ('00' + o[k]).substr(('' + o[k]).length)
          );
      return fmt;
    }

    msg(title = name, subt = '', desc = '', opts) {
      const toEnvOpts = (rawOpts) => {
        if (!rawOpts) return rawOpts;
        if (typeof rawOpts === 'string') {
          if (this.isLoon()) return rawOpts;
          else if (this.isQuanX()) return { 'open-url': rawOpts };
          else if (this.isSurge()) return { url: rawOpts };
          else return undefined;
        } else if (typeof rawOpts === 'object') {
          if (this.isLoon()) {
            let openUrl = rawOpts.openUrl || rawOpts.url || rawOpts['open-url'];
            let mediaUrl = rawOpts.mediaUrl || rawOpts['media-url'];
            return { openUrl, mediaUrl };
          } else if (this.isQuanX()) {
            let openUrl = rawOpts['open-url'] || rawOpts.url || rawOpts.openUrl;
            let mediaUrl = rawOpts['media-url'] || rawOpts.mediaUrl;
            let updatePasteboard =
              rawOpts['update-pasteboard'] || rawOpts.updatePasteboard;
            return {
              'open-url': openUrl,
              'media-url': mediaUrl,
              'update-pasteboard': updatePasteboard,
            };
          } else if (this.isSurge()) {
            let openUrl = rawOpts.url || rawOpts.openUrl || rawOpts['open-url'];
            return { url: openUrl };
          }
        } else {
          return undefined;
        }
      };
      if (!this.isMute) {
        if (this.isSurge() || this.isLoon()) {
          $notification.post(title, subt, desc, toEnvOpts(opts));
        } else if (this.isQuanX()) {
          $notify(title, subt, desc, toEnvOpts(opts));
        }
      }
      if (!this.isMuteLog) {
        let logs = ['', '==============📣系统通知📣=============='];
        logs.push(title);
        subt ? logs.push(subt) : '';
        desc ? logs.push(desc) : '';
        console.log(logs.join('\n'));
        this.logs = this.logs.concat(logs);
      }
    }

    log(...logs) {
      if (logs.length > 0) {
        this.logs = [...this.logs, ...logs];
      }
      console.log(logs.join(this.logSeparator));
    }

    logErr(err, msg) {
      const isPrintSack = !this.isSurge() && !this.isQuanX() && !this.isLoon();
      if (!isPrintSack) {
        this.log('', `❗️${this.name}, 错误!`, err);
      } else {
        this.log('', `❗️${this.name}, 错误!`, err.stack);
      }
    }

    wait(time) {
      return new Promise((resolve) => setTimeout(resolve, time));
    }

    done(val = {}) {
      const endTime = new Date().getTime();
      const costTime = (endTime - this.startTime) / 1000;
      this.log('', `🔔${this.name}, 结束! 🕛 ${costTime} 秒`);
      this.log();
      if (this.isSurge() || this.isQuanX() || this.isLoon()) {
        $done(val);
      }
    }
  })(name, opts);
}
