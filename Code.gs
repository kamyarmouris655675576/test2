const VERSION = "1.0";

function doGet() {
  return jsonOutput({
    success: true,
    service: "MOURIS WATCH",
    status: "online",
    version: VERSION
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("درخواست خالی است.");
    }

    const request = JSON.parse(e.postData.contents);
    const data = request.data || {};
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
    const rootFolderId = properties.getProperty("REPAIR_DRIVE_FOLDER_ID");

    if (!spreadsheetId || !rootFolderId) {
      throw new Error("تنظیمات دیتابیس پیدا نشد.");
    }

    const configs = {
      order: {
        sheet: "سفارش‌ها",
        fields: ["name", "phone", "itemName", "itemDetails", "price", "expectedDate", "notes"]
      },
      repair: {
        sheet: "تعمیرات",
        fields: ["name", "phone", "watchBrand", "watchModel", "condition", "issue", "price"]
      }
    };

    const config = configs[request.type];
    if (!config) throw new Error("نوع فرم نامعتبر است.");

    const photos = request.type === "repair" && Array.isArray(data.photos) ? data.photos : [];
    if (photos.length > 5) throw new Error("حداکثر ۵ عکس مجاز است.");

    const preparedPhotos = [];
    let totalBytes = 0;

    photos.forEach((photo, index) => {
      if (!photo || !photo.data) throw new Error("اطلاعات عکس شماره " + (index + 1) + " ناقص است.");
      if (String(photo.type || "").toLowerCase() !== "image/jpeg") {
        throw new Error("عکس شماره " + (index + 1) + " باید JPEG باشد.");
      }

      const base64 = String(photo.data).replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("اطلاعات عکس معتبر نیست.");

      const bytes = Utilities.base64Decode(base64);
      if (bytes.length < 3 || (bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216 || (bytes[2] & 255) !== 255) {
        throw new Error("فایل عکس JPEG معتبر نیست.");
      }
      if (bytes.length > 420 * 1024) throw new Error("حجم هر عکس بیشتر از ۴۲۰ کیلوبایت است.");

      totalBytes += bytes.length;
      if (totalBytes > 3 * 1024 * 1024) throw new Error("حجم مجموع عکس‌ها بیشتر از ۳ مگابایت است.");

      const safeName = String(photo.name || "photo").replace(/[\\/:*?"<>|]/g, "-").substring(0, 60);
      preparedPhotos.push(Utilities.newBlob(bytes, "image/jpeg", (index + 1) + "-" + safeName + ".jpg"));
    });

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(config.sheet);
    if (!sheet) throw new Error("تب " + config.sheet + " پیدا نشد.");

    let photoFolderUrl = "";

    if (request.type === "repair") {
      const rootFolder = DriveApp.getFolderById(rootFolderId);
      const customerName = String(data.name || "مشتری بدون نام")
        .replace(/[\\/:*?"<>|#%{}\[\]]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 80) || "مشتری بدون نام";

      const orderFolder = rootFolder.createFolder(customerName);
      preparedPhotos.forEach(blob => orderFolder.createFile(blob));
      photoFolderUrl = orderFolder.getUrl();
    }

    const rowData = [new Date()].concat(config.fields.map(field => data[field] == null ? "" : String(data[field])));
    sheet.appendRow(rowData);
    const rowNumber = sheet.getLastRow();

    if (request.type === "repair") {
      const link = SpreadsheetApp.newRichTextValue()
        .setText("مشاهده پوشه تصاویر")
        .setLinkUrl(photoFolderUrl)
        .build();
      sheet.getRange(rowNumber, 9).setRichTextValue(link);
    }

    SpreadsheetApp.flush();

    return jsonOutput({
      success: true,
      message: "اطلاعات با موفقیت ثبت شد.",
      version: VERSION,
      row: rowNumber,
      receivedPhotos: preparedPhotos.length,
      photoFolderUrl: photoFolderUrl
    });

  } catch (error) {
    console.error("MOURIS_ERROR", error && error.stack ? error.stack : String(error));
    return jsonOutput({
      success: false,
      version: VERSION,
      message: error && error.message ? error.message : String(error)
    });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function jsonOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
