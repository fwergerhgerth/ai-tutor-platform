package ingestion

import (
	"fmt"
	"hash/fnv"
	"regexp"
	"sort"
	"strings"
)

var noisyMathMarkers = []string{"", "", "", "", ""}

func Preview(req PreviewRequest) (PreviewResponse, error) {
	profile := withDefaults(req.Profile)
	if profile.SourceID == "" {
		return PreviewResponse{}, fmt.Errorf("sourceId is required")
	}

	chapterMatchers, err := compilePatterns(profile.ChapterPatterns)
	if err != nil {
		return PreviewResponse{}, fmt.Errorf("chapterPatterns: %w", err)
	}
	sectionMatchers, err := compilePatterns(profile.SectionPatterns)
	if err != nil {
		return PreviewResponse{}, fmt.Errorf("sectionPatterns: %w", err)
	}
	problemMatchers, err := compilePatterns(profile.ProblemPatterns)
	if err != nil {
		return PreviewResponse{}, fmt.Errorf("problemPatterns: %w", err)
	}

	pages := append([]PageText(nil), req.Pages...)
	sort.Slice(pages, func(i, j int) bool { return pages[i].Page < pages[j].Page })

	var taxonomy []TaxonomyNode
	var problems []ProblemSpan
	var issues []QualityIssue
	var currentChapter *TaxonomyNode
	var currentSection *TaxonomyNode
	var currentBlock string
	var activeProblem *ProblemSpan
	seenNodes := map[string]bool{}

	flushProblem := func() {
		if activeProblem == nil {
			return
		}
		activeProblem.Content = normalizeWhitespace(activeProblem.Content)
		if activeProblem.Content == "" {
			issues = append(issues, QualityIssue{
				Severity: "warn",
				Code:     "empty_problem",
				Message:  "题号被识别出来，但题面内容为空。",
				Page:     activeProblem.Page,
			})
		}
		if activeProblem.SectionID == "" {
			issues = append(issues, QualityIssue{
				Severity: "warn",
				Code:     "orphan_problem",
				Message:  "题目没有挂到任何小节，建议检查章节标题或页码范围。",
				Page:     activeProblem.Page,
			})
		}
		problems = append(problems, *activeProblem)
		activeProblem = nil
	}

	for _, page := range pages {
		pageNo := page.Page + profile.PageOffset
		if pageNo <= 0 {
			pageNo = page.Page
		}
		if hasNoisyMathText(page.Text) {
			issues = append(issues, QualityIssue{
				Severity: "info",
				Code:     "noisy_math_text",
				Message:  "页面包含疑似乱码数学符号，可在后续用 OCR/Markdown 转换工具清洗题面。",
				Page:     pageNo,
			})
		}

		lines := splitLines(page.Text)
		for _, line := range lines {
			if marker := matchBlockMarker(line, profile.BlockMarkers); marker != "" {
				currentBlock = marker
			}

			if matchesAny(chapterMatchers, line) {
				flushProblem()
				node := makeNode(profile.SourceID, "", "chapter", line, nil, pageNo)
				if !seenNodes[node.ID] {
					taxonomy = append(taxonomy, node)
					seenNodes[node.ID] = true
				}
				currentChapter = &node
				currentSection = nil
				continue
			}

			if matchesAny(sectionMatchers, line) {
				flushProblem()
				parentID := ""
				path := []string{}
				if currentChapter != nil {
					parentID = currentChapter.ID
					path = currentChapter.Path
				}
				node := makeNode(profile.SourceID, parentID, "section", line, path, pageNo)
				if !seenNodes[node.ID] {
					taxonomy = append(taxonomy, node)
					seenNodes[node.ID] = true
				}
				currentSection = &node
				continue
			}

			if number, ok := matchProblem(problemMatchers, line); ok {
				flushProblem()
				id := fmt.Sprintf("%s:p%03d:%s", profile.SourceID, pageNo, stableSuffix(number+line))
				labelIDs := []string{}
				chapterID := ""
				sectionID := ""
				if currentChapter != nil {
					chapterID = currentChapter.ID
					labelIDs = append(labelIDs, currentChapter.ID)
				}
				if currentSection != nil {
					sectionID = currentSection.ID
					labelIDs = append(labelIDs, currentSection.ID)
				}
				activeProblem = &ProblemSpan{
					ID:        id,
					Page:      pageNo,
					Number:    number,
					Content:   strings.TrimSpace(line),
					ChapterID: chapterID,
					SectionID: sectionID,
					BlockType: currentBlock,
					LabelIDs:  labelIDs,
				}
				continue
			}

			if activeProblem != nil {
				activeProblem.Content += "\n" + line
			}
		}
	}
	flushProblem()

	if len(taxonomy) == 0 {
		issues = append(issues, QualityIssue{
			Severity: "error",
			Code:     "no_taxonomy",
			Message:  "没有识别到章节或小节，请检查 chapterPatterns / sectionPatterns。",
		})
	}
	if len(problems) == 0 {
		issues = append(issues, QualityIssue{
			Severity: "error",
			Code:     "no_problems",
			Message:  "没有识别到题目，请检查 problemPatterns。",
		})
	}

	metrics := PreviewMetrics{
		PageCount:        len(pages),
		TaxonomyCount:    len(taxonomy),
		ProblemCount:     len(problems),
		IssueCount:       len(issues),
		TextQualityHints: countIssues(issues, "noisy_math_text"),
		OrphanProblem:    countIssues(issues, "orphan_problem"),
	}

	if taxonomy == nil {
		taxonomy = []TaxonomyNode{}
	}
	if problems == nil {
		problems = []ProblemSpan{}
	}
	if issues == nil {
		issues = []QualityIssue{}
	}

	return PreviewResponse{
		SourceID: profile.SourceID,
		Title:    profile.Title,
		Taxonomy: taxonomy,
		Problems: problems,
		Issues:   issues,
		Metrics:  metrics,
	}, nil
}

func withDefaults(profile SourceProfile) SourceProfile {
	if len(profile.ChapterPatterns) == 0 {
		profile.ChapterPatterns = []string{`^第[一二三四五六七八九十0-9]+章`}
	}
	if len(profile.SectionPatterns) == 0 {
		profile.SectionPatterns = []string{`^§\d+(\.\d+)*\s+`, `^第[一二三四五六七八九十0-9]+讲`}
	}
	if len(profile.ProblemPatterns) == 0 {
		profile.ProblemPatterns = []string{`^\(?\d+\)?[\.、)]?`}
	}
	if profile.BlockMarkers == nil {
		profile.BlockMarkers = map[string]string{}
	}
	return profile
}

func compilePatterns(patterns []string) ([]*regexp.Regexp, error) {
	matchers := make([]*regexp.Regexp, 0, len(patterns))
	for _, pattern := range patterns {
		compiled, err := regexp.Compile(pattern)
		if err != nil {
			return nil, err
		}
		matchers = append(matchers, compiled)
	}
	return matchers, nil
}

func splitLines(text string) []string {
	raw := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func matchesAny(matchers []*regexp.Regexp, line string) bool {
	for _, matcher := range matchers {
		if matcher.MatchString(line) {
			return true
		}
	}
	return false
}

func matchProblem(matchers []*regexp.Regexp, line string) (string, bool) {
	for _, matcher := range matchers {
		if loc := matcher.FindStringIndex(line); loc != nil && loc[0] == 0 {
			return strings.TrimSpace(line[loc[0]:loc[1]]), true
		}
	}
	return "", false
}

func matchBlockMarker(line string, markers map[string]string) string {
	for key, label := range markers {
		if strings.Contains(line, label) {
			return key
		}
	}
	return ""
}

func makeNode(sourceID, parentID, kind, title string, parentPath []string, page int) TaxonomyNode {
	path := append([]string(nil), parentPath...)
	path = append(path, title)
	return TaxonomyNode{
		ID:       fmt.Sprintf("%s:%s:%s", sourceID, kind, stableSuffix(title)),
		ParentID: parentID,
		Kind:     kind,
		Title:    title,
		Path:     path,
		Page:     page,
	}
}

func stableSuffix(value string) string {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(value))
	return fmt.Sprintf("%08x", hash.Sum32())
}

func normalizeWhitespace(value string) string {
	lines := splitLines(value)
	return strings.Join(lines, "\n")
}

func hasNoisyMathText(text string) bool {
	for _, marker := range noisyMathMarkers {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func countIssues(issues []QualityIssue, code string) int {
	count := 0
	for _, issue := range issues {
		if issue.Code == code {
			count++
		}
	}
	return count
}
