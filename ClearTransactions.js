// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: trash;

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const csvPath = fm.joinPath(dir, "Transactions.csv")

const HEADER = "date,amount,type,category,subcategory,note\n"

// If file exists, overwrite with header
if (fm.fileExists(csvPath)) {
  await fm.downloadFileFromiCloud(csvPath)
  fm.writeString(csvPath, HEADER)
} else {
  // If it doesn't exist yet, create it
  fm.writeString(csvPath, HEADER)
}

Script.complete()