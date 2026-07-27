/**
 * =========================================================
 * LFmall 인플루언서 어필리에이트 신청 - 메일 발송 서버 (Google Apps Script)
 * =========================================================
 * [역할]
 *  - 신청 화면(index.html + app.js)에서 전송한 신청 내용을 받아
 *    지정한 수신자 이메일로 발송합니다. (첨부파일 포함)
 *
 * [수신자 관리]
 *  - 아래 DEFAULT_RECIPIENTS 배열에 이메일을 추가/삭제하면 됩니다.
 *  - 화면(app.js)의 CONFIG.RECIPIENTS 값이 함께 전달되며,
 *    ALLOW_CLIENT_RECIPIENTS 를 true로 두면 화면 쪽 설정을 우선 사용합니다.
 *    (외부 악용이 걱정되면 false로 바꿔 서버 목록만 사용하세요.)
 *
 * [배포 방법]  ※ 자세한 단계는 README.md 참고
 *  1) script.google.com → 새 프로젝트 → 이 코드 붙여넣기
 *  2) 배포 → 새 배포 → 유형: 웹 앱
 *     - 실행 계정: 나 / 액세스 권한: 모든 사용자
 *  3) 발급된 웹앱 URL(https://script.google.com/macros/s/…/exec)을
 *     app.js의 CONFIG.APPS_SCRIPT_URL 에 붙여넣기
 */

var DEFAULT_RECIPIENTS = [
  "buycrown@lfcorp.com",
  "yr.kwon@lfcorp.com"
  // 수신자를 추가하려면 이 아래에 "이메일주소" 형태로 한 줄씩 추가하세요.
];

var ALLOW_CLIENT_RECIPIENTS = true; // 화면(app.js)에서 보낸 수신자 목록 허용 여부

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    /* 수신자 결정 */
    var recipients = DEFAULT_RECIPIENTS;
    if (ALLOW_CLIENT_RECIPIENTS && data.recipients && data.recipients.length > 0) {
      recipients = data.recipients;
    }

    /* 메일 본문 구성 (HTML) */
    var snsRows = (data.snsChannels || [])
      .map(function (s) {
        return "<tr><td style='padding:6px 10px;border:1px solid #ddd;'>" + s.channel +
               "</td><td style='padding:6px 10px;border:1px solid #ddd;'><a href='" + s.url + "'>" + s.url + "</a></td></tr>";
      })
      .join("");

    var htmlBody =
      "<div style='font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:14px;color:#1a1a1a;'>" +
      "<h2 style='color:#E4002B;'>[LFmall] 인플루언서 어필리에이트 신규 신청</h2>" +
      "<table style='border-collapse:collapse;width:100%;max-width:560px;'>" +
      row("이메일", data.email) +
      row("이름", data.name) +
      row("활동명", data.nickname) +
      row("관심 카테고리", (data.categories || []).join(", ")) +
      row("휴대폰번호", data.phone) +
      row("사업자 유무", data.bizStatus) +
      row("신청 일시", data.submittedAt) +
      "</table>" +
      "<h3 style='margin-top:20px;'>SNS 채널</h3>" +
      "<table style='border-collapse:collapse;width:100%;max-width:560px;'>" +
      "<tr><th style='padding:6px 10px;border:1px solid #ddd;background:#f5f5f7;'>채널</th>" +
      "<th style='padding:6px 10px;border:1px solid #ddd;background:#f5f5f7;'>주소</th></tr>" +
      snsRows +
      "</table>" +
      (data.attachments && data.attachments.length > 0
        ? "<p style='margin-top:16px;'>📎 첨부파일 " + data.attachments.length + "개: <b>" +
          data.attachments.map(function (a) { return a.fileName; }).join(", ") +
          "</b> (본 메일에 첨부되어 있습니다.)</p>"
        : "<p style='margin-top:16px;color:#8a8a8a;'>첨부파일 없음</p>") +
      "</div>";

    /* 첨부파일 복원 (base64 → Blob, 여러 개 지원) */
    var options = { htmlBody: htmlBody, name: "LFmall 어필리에이트 신청" };
    if (data.attachments && data.attachments.length > 0) {
      options.attachments = data.attachments.map(function (a) {
        return Utilities.newBlob(
          Utilities.base64Decode(a.base64),
          a.mimeType || "application/octet-stream",
          a.fileName
        );
      });
    }

    /* 메일 발송 */
    MailApp.sendEmail(
      recipients.join(","),
      "[LFmall 어필리에이트] 인플루언서 신청 - " + data.nickname + " (" + data.name + ")",
      "HTML 메일을 지원하지 않는 환경입니다. 신청자: " + data.name + " / " + data.email,
      options
    );

    return jsonResponse({ status: "ok" });
  } catch (err) {
    return jsonResponse({ status: "error", message: String(err) });
  }
}

function row(label, value) {
  return "<tr><th style='padding:6px 10px;border:1px solid #ddd;background:#f5f5f7;text-align:left;width:130px;'>" +
         label + "</th><td style='padding:6px 10px;border:1px solid #ddd;'>" + (value || "-") + "</td></tr>";
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
