const entries = [
  {
    concept: "to get used to something new",
    en: "to adapt",
    de: "sich anpassen",
    id: "beradaptasi",
    vi: "thích nghi",
    km: "som-ROP-kloon"
  },
  {
    concept: "to postpone to a later time",
    en: "to postpone",
    de: "verschieben",
    id: "menunda",
    vi: "hoãn lại",
    km: "PON-yee-ah-PEL"
  },
  {
    concept: "to handle a difficult situation",
    en: "to cope",
    de: "zurechtkommen",
    id: "mengatasi",
    vi: "đối phó",
    km: "TOP-tohl"
  },
  {
    concept: "to make something easier",
    en: "to simplify",
    de: "vereinfachen",
    id: "menyederhanakan",
    vi: "đơn giản hóa",
    km: "som-ROOL"
  },
  {
    concept: "to critically examine something",
    en: "to analyze",
    de: "analysieren",
    id: "menganalisis",
    vi: "phân tích",
    km: "vee-PEE-ak"
  },
  {
    concept: "to justify an action or opinion",
    en: "to justify",
    de: "rechtfertigen",
    id: "membenarkan",
    vi: "biện minh",
    km: "rek-FAIR"
  },
  {
    concept: "to rely on someone or something",
    en: "to rely on",
    de: "sich verlassen auf",
    id: "mengandalkan",
    vi: "dựa vào",
    km: "ah-SAH-rye ler"
  },
  {
    concept: "to consider carefully before acting",
    en: "to reconsider",
    de: "überdenken",
    id: "mempertimbangkan kembali",
    vi: "xem xét lại",
    km: "pee-ja-RA-na m'dong-TEET"
  },
  {
    concept: "to gradually increase in intensity",
    en: "to escalate",
    de: "eskalieren",
    id: "meningkat tajam",
    vi: "leo thang",
    km: "KERN-laeng"
  },
  {
    concept: "to gradually decrease or weaken",
    en: "to diminish",
    de: "abnehmen",
    id: "berkurang",
    vi: "giảm bớt",
    km: "jom-TOCH-toch"
  },
  {
    concept: "inner strength and persistence",
    en: "resilience",
    de: "Widerstandskraft",
    id: "ketangguhan",
    vi: "khả năng chống chịu",
    km: "pee-ap-THON-trorm"
  },
  {
    concept: "ability to change direction easily",
    en: "flexibility",
    de: "Flexibilität",
    id: "fleksibilitas",
    vi: "tính linh hoạt",
    km: "pee-ap-BUT-bain"
  },
  {
    concept: "clear and logical thinking",
    en: "clarity",
    de: "Klarheit",
    id: "kejelasan",
    vi: "sự rõ ràng",
    km: "pee-ap-CLAHS-lahs"
  },
  {
    concept: "strong wish to do something",
    en: "determination",
    de: "Entschlossenheit",
    id: "keteguhan",
    vi: "sự quyết tâm",
    km: "sa-MRET-jet RING-mahm"
  },
  {
    concept: "state of being under pressure",
    en: "tension",
    de: "Anspannung",
    id: "ketegangan",
    vi: "căng thẳng",
    km: "pee-ap-TEN-teng"
  },
  {
    concept: "unexpected positive result",
    en: "breakthrough",
    de: "Durchbruch",
    id: "terobosan",
    vi: "bước đột phá",
    km: "BUHK-dote-FAR"
  },
  {
    concept: "useful disadvantage/advantage comparison",
    en: "trade‑off",
    de: "Abwägung",
    id: "kompromi",
    vi: "sự đánh đổi",
    km: "KAR-daeng-DOY"
  },
  {
    concept: "something that causes delay",
    en: "obstacle",
    de: "Hindernis",
    id: "rintangan",
    vi: "chướng ngại vật",
    km: "OOP-a-sok"
  },
  {
    concept: "small but important detail",
    en: "nuance",
    de: "Nuance",
    id: "nuansa",
    vi: "sắc thái",
    km: "SUK-tai"
  },
  {
    concept: "overall mood or feeling",
    en: "atmosphere",
    de: "Atmosphäre",
    id: "suasana",
    vi: "không khí",
    km: "b'REE-ya-kas"
  },
  {
    concept: "way something is seen or understood",
    en: "perspective",
    de: "Perspektive",
    id: "perspektif",
    vi: "góc nhìn",
    km: "toss-sa-na-VEE-say"
  },
  {
    concept: "ability to notice small details",
    en: "awareness",
    de: "Bewusstsein",
    id: "kesadaran",
    vi: "nhận thức",
    km: "kar-YOHL-deng"
  },
  {
    concept: "natural skill for something",
    en: "talent",
    de: "Talent",
    id: "bakat",
    vi: "tài năng",
    km: "TEP-ko-sal"
  },
  {
    concept: "strong interest in something",
    en: "passion",
    de: "Leidenschaft",
    id: "gairah",
    vi: "đam mê",
    km: "DAM-may"
  },
  {
    concept: "quality of being reliable",
    en: "consistency",
    de: "Konsequenz",
    id: "konsistensi",
    vi: "tính nhất quán",
    km: "pee-ap-NYOT-kwan"
  },
  {
    concept: "small difference between things",
    en: "distinction",
    de: "Unterscheidung",
    id: "perbedaan",
    vi: "sự phân biệt",
    km: "kar-PRIA-pria"
  },
  {
    concept: "useful practical knowledge",
    en: "insight",
    de: "Einblick",
    id: "wawasan",
    vi: "hiểu biết sâu sắc",
    km: "kar-YOHL jrow-jrow"
  },
  {
    concept: "something not yet certain",
    en: "assumption",
    de: "Annahme",
    id: "asumsi",
    vi: "giả định",
    km: "kar-SON-mat"
  },
  {
    concept: "careful planned attempt",
    en: "initiative",
    de: "Initiative",
    id: "inisiatif",
    vi: "sáng kiến",
    km: "SANG-kee-en"
  },
  {
    concept: "expected result or effect",
    en: "impact",
    de: "Auswirkung",
    id: "dampak",
    vi: "tác động",
    km: "IT-tee-pol"
  }
];

const LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "id", label: "ID" },
  { code: "vi", label: "VI" },
  { code: "km", label: "KM" }  // Khmer pronunciation
];

const idx = Math.floor(Math.random() * entries.length);
const entry = entries[idx];

let widget = new ListWidget();
widget.backgroundColor = new Color("#111827");
const fam = config.widgetFamily;

function addLangRow(lang, widget, fontSize) {
  const value = entry[lang.code];
  if (!value) return;

  let row = widget.addStack();
  row.layoutHorizontally();

  let labelText = row.addText(`${lang.label}: `);
  labelText.font = Font.systemFont(fontSize);
  labelText.textColor = Color.gray();
  labelText.minimumScaleFactor = 0.7;
  labelText.lineLimit = 1;

  let wordText = row.addText(value);
  wordText.font = Font.systemFont(fontSize);
  wordText.textColor = Color.white();
  wordText.minimumScaleFactor = 0.7;
  wordText.lineLimit = 1;
}

if (fam === "accessoryRectangular") {
  widget.setPadding(4, 8, 4, 8);
  const rowFontSize = 13;  // adjust if 5 rows are too tight
  for (const lang of LANGS) addLangRow(lang, widget, rowFontSize);
} else {
  widget.setPadding(6, 10, 6, 10);

  let conceptText = widget.addText(entry.concept);
  conceptText.font = Font.systemFont(14);
  conceptText.textColor = Color.gray();
  conceptText.minimumScaleFactor = 0.8;
  conceptText.lineLimit = 3;

  widget.addSpacer(4);

  const rowFontSize = 16;
  for (const lang of LANGS) addLangRow(lang, widget, rowFontSize);
}

if (config.runsInAccessoryWidget || config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
