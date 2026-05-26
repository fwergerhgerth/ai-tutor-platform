# AI Tutor Platform

AI Tutor Platform 是一个面向学习场景的全栈项目骨架。当前第一个模块是 **教材/讲义导入**：将课程资料中的章节结构、题号规则和区块标记配置成 source profile，并把 PDF 中抽取出的页文本转成课程标签体系与题目挂接预览。

## Module 1: Course Ingestion

当前模块先解决三个问题：

- 用 `source profile` 描述不同教材/讲义的章节标题、题号格式、区块标记和页码偏移。
- 上传 PDF 后，后端使用 PyMuPDF 提取文字层；当页面没有可靠文字层时，自动调用 Tesseract 中文 OCR fallback，并将统一的页文本解析为 `taxonomy`、`problem spans` 和初始 `labelIds`。
- 对未挂接题目、乱码数学符号、缺失章节等情况输出质量检查结果。

这个模块不声称能解析任意 PDF。当前可导入带文字层 PDF 和可被中文 OCR 识别的扫描 PDF；复杂公式保真或复杂版面资料仍需要后续接入 PaddleOCR、Marker、MinerU 等更强的解析能力。

## Project Layout

```text
ai-tutor-platform/
  backend/    Go API service
  frontend/   React + Vite workspace UI
```

## Backend

```bash
cd backend
go run ./cmd/server
```

默认监听：

```text
http://localhost:8080
```

如果本机 `8080` 已被占用，可以换端口：

```bash
PORT=19091 go run ./cmd/server
```

API:

- `GET /api/health`
- `GET /api/modules`
- `GET /api/ingestion/sample`
- `POST /api/ingestion/preview`
- `POST /api/ingestion/pdf` (`multipart/form-data`: `file`, `profile`)

## Frontend

```bash
cd frontend
npm install
npm run dev
```

默认访问：

```text
http://localhost:5173
```

如后端不在 `localhost:8080`，可以设置：

```bash
VITE_API_BASE=http://localhost:8080 npm run dev
```

例如后端使用 `19091`：

```bash
VITE_API_BASE=http://127.0.0.1:19091 npm run dev
```

## Preview Request Shape

```json
{
  "profile": {
    "sourceId": "a4-shuer-ten-years",
    "title": "考研数学这十年数二做题本",
    "layout": "single_column",
    "chapterPatterns": ["^第[一二三四五六七八九十]+章"],
    "sectionPatterns": ["^§\\d+\\.\\d+\\s+"],
    "problemPatterns": ["^\\(\\d+\\)"],
    "blockMarkers": {
      "ten_year_exam": "十年真题",
      "selected_problem": "真题精选",
      "summary_note": "考点总结"
    }
  },
  "pages": [
    {
      "page": 72,
      "text": "第三章 一元函数积分学\n§3.1 不定积分、定积分与反常积分的概念\n十年真题\n(1) 设 f(x) 连续..."
    }
  ]
}
```

本地 OCR 默认会寻找：

```text
/Users/wangzhuo/.miniforge3/bin/tesseract
```

也可以用环境变量覆盖：

```bash
TESSERACT_BIN=/path/to/tesseract TESSERACT_LANG=chi_sim+eng go run ./cmd/server
```

## Next Steps

- 对复杂公式和复杂版面接入 PaddleOCR/Marker/MinerU provider，并将输出统一成 `PageText[]`。
- 将 `taxonomy` 持久化为课程标签体系，将 `problem spans` 持久化为题库导入记录。
- 增加 LLM closed-set tagging，把扩充题库映射到已有课程标签体系。
