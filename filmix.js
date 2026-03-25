/*
 * filmix-ai影视库重命名整理刮削 VIP解锁
 * 更新时间：2026-03
 */

let obj = JSON.parse($response.body);

obj.is_vip = true;
obj.vip_level = 5; // 提升至 VIP 5 以获取最高权限
obj.vip_start_time = "2025-01-01T00:00:00.000Z";
obj.vip_end_time = "2099-12-31T23:59:59.999Z";
obj.first_vip_start_time = "2025-01-01T00:00:00.000Z";

// 删除原有的 obj.user.vip_level = 1 冗余代码

$done({body: JSON.stringify(obj)});