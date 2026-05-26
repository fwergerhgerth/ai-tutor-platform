package ingestion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

type PDFExtractor struct {
	PythonBin  string
	ScriptPath string
}

func (e PDFExtractor) Extract(ctx context.Context, pdfPath string) (PDFExtractionResult, error) {
	if e.PythonBin == "" || e.ScriptPath == "" {
		return PDFExtractionResult{}, fmt.Errorf("PDF extractor is not configured")
	}

	cmd := exec.CommandContext(ctx, e.PythonBin, e.ScriptPath, "--pdf", pdfPath)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if err != nil {
		message := stderr.String()
		if message == "" {
			message = err.Error()
		}
		return PDFExtractionResult{}, fmt.Errorf("PDF extraction failed: %s", message)
	}

	var result PDFExtractionResult
	if err := json.Unmarshal(output, &result); err != nil {
		return PDFExtractionResult{}, fmt.Errorf("invalid PDF extraction output: %w", err)
	}
	if result.Pages == nil {
		result.Pages = []PageText{}
	}
	if result.Summary.Warnings == nil {
		result.Summary.Warnings = []string{}
	}
	return result, nil
}
