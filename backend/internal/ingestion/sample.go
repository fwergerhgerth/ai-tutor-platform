package ingestion

func SampleRequest() PreviewRequest {
	return PreviewRequest{
		Profile: SourceProfile{
			SourceID: "a4-shuer-ten-years",
			Title:    "考研数学这十年数二做题本",
			Layout:   "single_column",
			ChapterPatterns: []string{
				`^第[一二三四五六七八九十]+章`,
			},
			SectionPatterns: []string{
				`^§\s*\d+\.\d+\s+`,
			},
			ProblemPatterns: []string{
				`^\(\s*\d+\s*\)`,
			},
			BlockMarkers: map[string]string{
				"ten_year_exam":    "十年真题",
				"selected_problem": "真题精选",
				"summary_note":     "考点总结",
			},
		},
		Pages: []PageText{
			{
				Page: 72,
				Text: `第三章 一元函数积分学
§3.1 不定积分、定积分与反常积分的概念
十年真题
(1) 设 f(x) 连续，判断原函数与不定积分的关系。
(2) 已知反常积分收敛，判断参数取值范围。`,
			},
			{
				Page: 80,
				Text: `§3.2 不定积分、定积分与反常积分的计算
十年真题
(1) 计算 ∫ f(g(x))g'(x) dx。
(2) 计算含根式结构的定积分，并判断是否适合换元。`,
			},
		},
	}
}
