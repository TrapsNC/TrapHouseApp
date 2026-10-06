export const collections = ["DISPOSABLES", "THCA", "TOBACCO", "ACCESSORIES"];

export function collectionFor(category: string, name = "") {
  const text = `${category} ${name}`.toLowerCase();
  if (/thca|thcv|hhc|thcp|hemp|delta|edible|gumm|flower|rosin|resin|indacloud|half bak|cookies lemonade|munchies/.test(text)) return "THCA";
  if (/vape|vaporiz|electronic cigarette|disposable|geek bar|raz ltx|lost mary|nexa/.test(text)) return "DISPOSABLES";
  if (/cigar cutter|ez splitz/.test(text)) return "ACCESSORIES";
  if (/cigar|tobacco|backwood|fronto|black.*mild|marlboro|newport|lucky strike|loose leaf/.test(text)) return "TOBACCO";
  if (/accessor|lighter|paper|glass|pipe|tray|clean|scale|fluid|diffuser|grinder|raw|cone|dice|dab tool|lookah|blazy susan/.test(text)) return "ACCESSORIES";
  return category && category !== "Uncategorized" ? category.split(">").pop()!.trim().replace(/[_-]/g, " ").toUpperCase() : "OTHER";
}
