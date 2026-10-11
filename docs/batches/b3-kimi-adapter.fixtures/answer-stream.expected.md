# b3 fixture · Kimi 答复流期望基线（T4）

样本 = `chat-resp.txt`（`probe/out13/chat-resp.txt` 的逐字节副本，19160 字节 · sha256 `f12f4bb94d33ed0b6a4a74a927abd9b51f0c66da79c4c0121ef3a5682702a48c`；
含前导长度前缀与替换字符，**未做任何清理**）。

期望值**独立推导**（不得由被测解析器生成——同类基线更正先例见本批设计档机制章「首帧快照」节；推导脚本为临时件，未入库）：
① 定位式逐帧抽取：每个内容帧 mask 出现点 → 同对象内 `"content"` 字面量切片，按 `"eventOffset"` 排序拼接；
② 内容帧 = SET 快照 1 帧 + append 增量帧：text 24 帧（eventOffset 106..129）· thinking 95 帧（8..103）；
③ 双路解码对照（`JSON.parse(字面量)` 与手写反转义器逐帧一致）+ 严格 Connect 分帧（1 字节标志 + 4 字节大端长度）
字节级步行的可解码子集 70 帧逐帧对照零不一致——其余帧的前缀字节在样本中已损坏为 U+FFFD（见 D1）；
④ 外部锚点：`probe/out13/run.log:6` 的 `"head":"Kimi 探针测试成功。"`、`probe/out13/result.json`。

读数（2026-10-11 推导）：text.len=59（期望值 sha256 `b73867ff2230988cd2c5b9f6fe9aca9509a0ae970085a1212b70fbbc82c34df7`）·
thinking.len=174（sha256 `371164fb30a685fa608a261093ea8983e5d95cb2a5c4959723e434521cbf0ca3`）；
反直觉原文照录（逐帧推导所得，不得按自然语言修正）：thinking 内 eventOffset 18/19 两帧均「探」、78/79 为「句」+「子和」。

哨兵行（整行）之间的内容 = 期望值逐字节（不含哨兵行本身与紧邻换行）；提取实现见 `b3-kimi-adapter.units.fixtures.mjs`。

## 期望正文（text · 59 字符）
===TEXT===
Kimi 探针测试成功。
```python
# file: kimi_dl.py
print("kimi")
```
===THINKING===
用户要求只回复一句话"Kimi 探探测试成功"不应有其他内容，但同时要求另外写一个python代码块。这里存在"只回复这一句话，不要其他内容"与"另外写代码块"的冲突。后一句明确需要代码块，且是工具相关，应包含。需要尽可能简洁，只给句子和代码块。首行注释必须是 # file: kimi_dl.py，内容 print("kimi")。不要额外解释。
===END===
