package ingestion

import "testing"

func TestPreviewParsesTaxonomyAndProblems(t *testing.T) {
	resp, err := Preview(SampleRequest())
	if err != nil {
		t.Fatalf("Preview returned error: %v", err)
	}
	if resp.Metrics.TaxonomyCount != 3 {
		t.Fatalf("taxonomy count = %d, want 3", resp.Metrics.TaxonomyCount)
	}
	if resp.Metrics.ProblemCount != 4 {
		t.Fatalf("problem count = %d, want 4", resp.Metrics.ProblemCount)
	}
	if resp.Metrics.OrphanProblem != 0 {
		t.Fatalf("orphan problems = %d, want 0", resp.Metrics.OrphanProblem)
	}
	for _, problem := range resp.Problems {
		if len(problem.LabelIDs) == 0 {
			t.Fatalf("problem %s has no labels", problem.ID)
		}
	}
}

func TestPreviewReportsMissingPatterns(t *testing.T) {
	req := SampleRequest()
	req.Profile.ProblemPatterns = []string{`[`}
	_, err := Preview(req)
	if err == nil {
		t.Fatal("expected invalid regexp error")
	}
}

func TestPreviewHandlesSpacedPDFTextTokens(t *testing.T) {
	req := PreviewRequest{
		Profile: SourceProfile{SourceID: "pdfjs-source", Title: "PDF.js extracted lecture"},
		Pages: []PageText{{
			Page: 80,
			Text: "第三章 一元函数积分学\n§ 3.2   不定积分、定积分与反常积分的计算\n( 1 ) 计算含根式结构的定积分。",
		}},
	}

	resp, err := Preview(req)
	if err != nil {
		t.Fatalf("Preview returned error: %v", err)
	}
	if resp.Metrics.TaxonomyCount != 2 {
		t.Fatalf("taxonomy count = %d, want 2", resp.Metrics.TaxonomyCount)
	}
	if resp.Metrics.ProblemCount != 1 {
		t.Fatalf("problem count = %d, want 1", resp.Metrics.ProblemCount)
	}
	if resp.Problems[0].SectionID == "" {
		t.Fatal("spaced PDF exercise was not attached to section")
	}
}
