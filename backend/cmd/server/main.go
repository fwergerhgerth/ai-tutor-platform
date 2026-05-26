package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ai-tutor-platform/backend/internal/ingestion"
)

func main() {
	extractor := ingestion.PDFExtractor{
		PythonBin:  env("PDF_PYTHON_BIN", "/opt/homebrew/bin/python3"),
		ScriptPath: env("PDF_EXTRACT_SCRIPT", "scripts/extract_pdf_pages.py"),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", healthHandler)
	mux.HandleFunc("GET /api/modules", modulesHandler)
	mux.HandleFunc("GET /api/ingestion/sample", sampleHandler)
	mux.HandleFunc("POST /api/ingestion/preview", previewHandler)
	mux.HandleFunc("POST /api/ingestion/pdf", pdfHandler(extractor))

	host := env("HOST", "127.0.0.1")
	port := env("PORT", "8080")
	addr := host + ":" + port
	server := &http.Server{
		Addr:              addr,
		Handler:           cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("ai tutor platform backend listening on http://%s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"service": "ai-tutor-platform-backend",
	})
}

func modulesHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"modules": []map[string]string{
			{
				"id":          "course-ingestion",
				"name":        "教材/讲义导入",
				"description": "从课程资料中抽取章节结构、题目切分和初始标签挂接。",
			},
		},
	})
}

func sampleHandler(w http.ResponseWriter, r *http.Request) {
	req := ingestion.SampleRequest()
	resp, err := ingestion.Preview(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"request":  req,
		"response": resp,
	})
}

func previewHandler(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req ingestion.PreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	resp, err := ingestion.Preview(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func pdfHandler(extractor ingestion.PDFExtractor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
		if err := r.ParseMultipartForm(12 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "invalid PDF upload: "+err.Error())
			return
		}

		var profile ingestion.SourceProfile
		if err := json.Unmarshal([]byte(r.FormValue("profile")), &profile); err != nil {
			writeError(w, http.StatusBadRequest, "invalid profile: "+err.Error())
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "PDF file is required")
			return
		}
		defer file.Close()

		if !strings.EqualFold(filepath.Ext(header.Filename), ".pdf") {
			writeError(w, http.StatusBadRequest, "only PDF uploads are supported by this endpoint")
			return
		}

		tempFile, err := os.CreateTemp("", "ai-tutor-upload-*.pdf")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create temporary PDF: "+err.Error())
			return
		}
		tempPath := tempFile.Name()
		defer os.Remove(tempPath)

		if _, err := io.Copy(tempFile, file); err != nil {
			tempFile.Close()
			writeError(w, http.StatusInternalServerError, "store uploaded PDF: "+err.Error())
			return
		}
		if err := tempFile.Close(); err != nil {
			writeError(w, http.StatusInternalServerError, "close uploaded PDF: "+err.Error())
			return
		}

		extracted, err := extractor.Extract(r.Context(), tempPath)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		resp, err := ingestion.Preview(ingestion.PreviewRequest{
			Profile: profile,
			Pages:   extracted.Pages,
		})
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("parse extracted PDF text: %v", err))
			return
		}

		if extracted.Summary.OCRPages > 0 {
			resp.Issues = append(resp.Issues, ingestion.QualityIssue{
				Severity: "warn",
				Code:     "ocr_review_required",
				Message:  "部分页面由 OCR 识别，数学公式和题号切分可能失真，请人工复核后保存图谱。",
			})
		}
		if extracted.Summary.BlankPages > 0 {
			resp.Issues = append(resp.Issues, ingestion.QualityIssue{
				Severity: "warn",
				Code:     "blank_pages",
				Message:  fmt.Sprintf("%d 页未提取到可读文本，请检查原始 PDF 或更换解析引擎。", extracted.Summary.BlankPages),
			})
		}
		resp.Metrics.IssueCount = len(resp.Issues)

		writeJSON(w, http.StatusOK, ingestion.PDFIngestionResponse{
			Profile:    profile,
			Pages:      extracted.Pages,
			Extraction: extracted.Summary,
			Preview:    resp,
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{
		"error": message,
	})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
