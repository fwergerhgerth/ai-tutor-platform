package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"ai-tutor-platform/backend/internal/ingestion"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", healthHandler)
	mux.HandleFunc("GET /api/modules", modulesHandler)
	mux.HandleFunc("GET /api/ingestion/sample", sampleHandler)
	mux.HandleFunc("POST /api/ingestion/preview", previewHandler)

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
