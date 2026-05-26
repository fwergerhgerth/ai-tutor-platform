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
