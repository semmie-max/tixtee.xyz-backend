function buildEmailHtml({ heading, bodyHtml, ctaText, ctaUrl, preview }) {
  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0; padding:0; background-color:#f7f5f8;}
  table{border-collapse:collapse;}
  img{border:0; height:auto; line-height:100%; outline:none; text-decoration:none;}
</style>
</head>
<body style="word-spacing:normal; background-color:#f7f5f8;">
  <div style="display:none; font-size:1px; color:#f7f5f8; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    ${preview || ''}
  </div>

  <div style="background-color:#f7f5f8; padding:24px 0;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:520px; margin:0 auto;">
      <tbody>
        <tr>
          <td style="padding:0 25px 20px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:16px; font-weight:800; letter-spacing:1px; color:#150017;">
              TIXTEE<span style="color:#9a9a9a; font-weight:400;">.XYZ</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:520px; margin:0 auto; background:#ffffff; border-radius:20px; box-shadow:0 4px 20px rgba(32,31,31,0.05);">
      <tbody>
        <tr>
          <td style="padding:36px 32px 8px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:22px; font-weight:700; line-height:30px; color:#1a1a1a;">
              ${heading}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 8px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14.5px; font-weight:400; line-height:22px; color:#434245;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        ${ctaText && ctaUrl ? `
        <tr>
          <td style="padding:20px 32px 36px; text-align:left;">
            <table border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td align="center" bgcolor="#47034E" style="border-radius:10px;" valign="middle">
                    <a href="${ctaUrl}" target="_blank" style="display:inline-block; background:#47034E; color:#ffffff; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:700; line-height:20px; text-decoration:none; padding:12px 26px; border-radius:10px;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>` : `<tr><td style="padding-bottom:24px;"></td></tr>`}
      </tbody>
    </table>

    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:520px; margin:0 auto;">
      <tbody>
        <tr>
          <td style="padding:20px 25px; text-align:center;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; font-weight:400; line-height:18px; color:#9a9a9a;">
              &copy; Tixtee.xyz, All Rights Reserved.
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>
`;
}

module.exports = { buildEmailHtml };