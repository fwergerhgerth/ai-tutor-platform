package ingestion

type SourceProfile struct {
	SourceID        string            `json:"sourceId"`
	Title           string            `json:"title"`
	Layout          string            `json:"layout"`
	ChapterPatterns []string          `json:"chapterPatterns"`
	SectionPatterns []string          `json:"sectionPatterns"`
	ProblemPatterns []string          `json:"problemPatterns"`
	BlockMarkers    map[string]string `json:"blockMarkers"`
	PageOffset      int               `json:"pageOffset"`
}

type PageText struct {
	Page int    `json:"page"`
	Text string `json:"text"`
}

type PreviewRequest struct {
	Profile SourceProfile `json:"profile"`
	Pages   []PageText    `json:"pages"`
}

type TaxonomyNode struct {
	ID       string   `json:"id"`
	ParentID string   `json:"parentId,omitempty"`
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Path     []string `json:"path"`
	Page     int      `json:"page"`
}

type ProblemSpan struct {
	ID        string   `json:"id"`
	Page      int      `json:"page"`
	Number    string   `json:"number"`
	Content   string   `json:"content"`
	ChapterID string   `json:"chapterId,omitempty"`
	SectionID string   `json:"sectionId,omitempty"`
	BlockType string   `json:"blockType,omitempty"`
	LabelIDs  []string `json:"labelIds"`
}

type QualityIssue struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	Page     int    `json:"page,omitempty"`
}

type PreviewMetrics struct {
	PageCount        int `json:"pageCount"`
	TaxonomyCount    int `json:"taxonomyCount"`
	ProblemCount     int `json:"problemCount"`
	OrphanProblem    int `json:"orphanProblem"`
	IssueCount       int `json:"issueCount"`
	TextQualityHints int `json:"textQualityHints"`
}

type PreviewResponse struct {
	SourceID string         `json:"sourceId"`
	Title    string         `json:"title"`
	Taxonomy []TaxonomyNode `json:"taxonomy"`
	Problems []ProblemSpan  `json:"problems"`
	Issues   []QualityIssue `json:"issues"`
	Metrics  PreviewMetrics `json:"metrics"`
}

type ExtractionSummary struct {
	Extractor   string   `json:"extractor"`
	Mode        string   `json:"mode"`
	PageCount   int      `json:"pageCount"`
	TextPages   int      `json:"textPages"`
	OCRPages    int      `json:"ocrPages"`
	BlankPages  int      `json:"blankPages"`
	OCRLanguage string   `json:"ocrLanguage,omitempty"`
	Warnings    []string `json:"warnings"`
}

type PDFExtractionResult struct {
	Pages   []PageText        `json:"pages"`
	Summary ExtractionSummary `json:"summary"`
}

type PDFIngestionResponse struct {
	Profile    SourceProfile     `json:"profile"`
	Pages      []PageText        `json:"pages"`
	Extraction ExtractionSummary `json:"extraction"`
	Preview    PreviewResponse   `json:"preview"`
}
