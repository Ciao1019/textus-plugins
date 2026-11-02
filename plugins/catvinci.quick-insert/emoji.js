// The emoji `:` finds: the commonest, by their GitHub-style names, other
// English words and Chinese ones. One line each: the emoji, its name, then
// what else finds it.

(function (root) {
  const TABLE = `
😀 grinning smile happy 笑 开心
😃 smiley smile happy 笑
😄 smile happy joy 笑 开心
😁 grin 笑 露齿
😆 laughing laugh 大笑
😅 sweat_smile 尴尬 汗
😂 joy tears laugh 笑哭
🤣 rofl laugh 笑翻
🙂 slightly_smiling_face smile 微笑
😉 wink 眨眼
😊 blush smile 害羞 微笑
😍 heart_eyes love 喜欢 爱
🥰 smiling_face_with_hearts love 爱
😘 kissing_heart kiss 亲
😋 yum delicious 好吃
😎 sunglasses cool 酷
🤔 thinking think 思考 想
🤨 raised_eyebrow doubt 怀疑
😐 neutral_face 无语
😑 expressionless 面无表情
🙄 roll_eyes 白眼
😏 smirk 坏笑
😴 sleeping sleep 睡觉
😪 sleepy 困
😮 open_mouth surprised 惊讶
😲 astonished shock 震惊
😳 flushed 脸红
🥺 pleading 可怜
😢 cry sad 哭 难过
😭 sob cry 大哭
😤 triumph 生气 哼
😠 angry 生气
😡 rage angry 愤怒
🤯 exploding_head mind_blown 炸了
😱 scream fear 尖叫 害怕
🤗 hugs hug 拥抱
🤫 shushing 嘘
🤐 zipper_mouth 闭嘴
😷 mask sick 口罩 生病
🤒 thermometer_face sick 发烧
🥳 partying_face party 庆祝 派对
🤓 nerd 书呆子
🧐 monocle 研究
😇 innocent angel 天使
🙃 upside_down 倒脸
🫠 melting 融化
👍 +1 thumbsup like yes 赞 好
👎 -1 thumbsdown no 踩
👌 ok_hand ok 好的
✌️ v victory 耶
🤞 crossed_fingers luck 祈祷 好运
👏 clap applause 鼓掌
🙌 raised_hands 欢呼
🙏 pray thanks please 谢谢 拜托 祈祷
💪 muscle strong 加油 肌肉
👋 wave hello bye 挥手 你好 再见
✋ raised_hand hand 举手
👉 point_right 右边
👈 point_left 左边
👆 point_up 上面
👇 point_down 下面
🤝 handshake deal 握手 合作
✍️ writing_hand write 写
👀 eyes look 看
🧠 brain think 大脑 思考
❤️ heart love red_heart 爱心 红心
🧡 orange_heart 橙心
💛 yellow_heart 黄心
💚 green_heart 绿心
💙 blue_heart 蓝心
💜 purple_heart 紫心
🖤 black_heart 黑心
💔 broken_heart 心碎
💯 100 hundred perfect 满分
🔥 fire hot lit 火 热
✨ sparkles shine 闪光 闪亮
⭐ star 星星
🌟 star2 glowing_star 闪亮的星
💡 bulb idea 灯泡 想法 主意
⚡ zap lightning 闪电
💥 boom 爆炸
🎉 tada party celebrate 庆祝 恭喜
🎊 confetti_ball 彩带
🎁 gift present 礼物
🎂 birthday cake 生日 蛋糕
🏆 trophy win 奖杯 冠军
🥇 1st_place gold medal 金牌 第一
🎯 dart target goal 目标
🚀 rocket launch ship 火箭 发布
✅ white_check_mark done check yes 完成 对
☑️ ballot_box_with_check 勾选
✔️ heavy_check_mark check 对勾
❌ x cross no wrong 错 不
❎ negative_squared_cross_mark 叉
⚠️ warning caution 警告 注意
❗ exclamation important 重要 感叹
❓ question 问号 疑问
⛔ no_entry stop 禁止
🚫 no_entry_sign forbidden 禁止
⏳ hourglass waiting 等待 沙漏
⏰ alarm_clock 闹钟
📅 date calendar 日历 日期
📆 calendar 日历
📌 pushpin pin 图钉 置顶
📍 round_pushpin location 位置
📎 paperclip attachment 回形针 附件
🔗 link 链接
📝 memo note write 笔记 记录 备忘
✏️ pencil2 pencil edit 铅笔 编辑
📖 book open_book read 书 阅读
📚 books library 书籍 图书馆
📄 page_facing_up document 文档 页面
📁 file_folder folder 文件夹
📊 bar_chart chart stats 图表 统计
📈 chart_with_upwards_trend up growth 增长 上升
📉 chart_with_downwards_trend down 下降
🔍 mag search 搜索 查找
🔒 lock locked 锁
🔑 key 钥匙
⚙️ gear settings 设置 齿轮
🛠️ hammer_and_wrench tools 工具
🐛 bug 虫 bug
💻 computer laptop 电脑
📱 iphone phone mobile 手机
📧 email mail 邮件
💬 speech_balloon comment chat 评论 聊天
🗨️ left_speech_bubble 对话
📢 loudspeaker announce 公告 通知
🔔 bell notification 铃 提醒
🎵 musical_note music 音乐
☕ coffee 咖啡
🍵 tea 茶
🍎 apple 苹果
🍕 pizza 披萨
🍜 ramen noodles 面条
🌱 seedling grow 发芽 成长
🌸 cherry_blossom flower 樱花 花
🌹 rose flower 玫瑰
🌈 rainbow 彩虹
☀️ sunny sun 太阳 晴
🌙 crescent_moon moon night 月亮 晚上
☁️ cloud 云
🌧️ cloud_with_rain rain 下雨
❄️ snowflake snow 雪
🌍 earth_africa world globe 地球 世界
🏠 house home 家 房子
🏢 office building 办公楼
🎓 mortar_board graduation 毕业
🧪 test_tube experiment 实验
🔬 microscope science 显微镜 科学
🐱 cat 猫
🐶 dog 狗
🐼 panda 熊猫
🦄 unicorn 独角兽
➡️ arrow_right 右箭头
⬅️ arrow_left 左箭头
⬆️ arrow_up 上箭头
⬇️ arrow_down 下箭头
🔄 arrows_counterclockwise refresh repeat 刷新 循环
➕ heavy_plus_sign plus add 加
➖ heavy_minus_sign minus 减
🆕 new 新
🆗 ok 好
🔴 red_circle red 红色
🟢 green_circle green 绿色
🟡 yellow_circle yellow 黄色
🔵 large_blue_circle blue 蓝色
`;

  const all = TABLE.trim()
    .split("\n")
    .map((line) => {
      const [char, name, ...more] = line.trim().split(/\s+/);
      return { char: char, name: name, words: [name, ...more].map((w) => w.toLowerCase()) };
    });

  /** How well `emoji` answers `query`: its name exactly, its name's start,
   *  another word's start, somewhere in a word; -1 not at all. */
  function rank(emoji, query) {
    if (emoji.name === query) return 0;
    if (emoji.name.startsWith(query)) return 1;
    if (emoji.words.some((w) => w.startsWith(query))) return 2;
    if (emoji.words.some((w) => w.includes(query))) return 3;
    return -1;
  }

  /** Up to `limit` emoji for what was typed after the colon, best first. */
  function search(typed, limit) {
    const query = String(typed).toLowerCase();
    if (!query) return [];
    return all
      .map((emoji) => ({ emoji: emoji, rank: rank(emoji, query) }))
      .filter((r) => r.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map((r) => r.emoji);
  }

  root.quickEmoji = { search: search, all: all };
})(typeof window !== "undefined" ? window : globalThis);
