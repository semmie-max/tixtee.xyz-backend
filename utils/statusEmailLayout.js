
function buildStatusEmailHtml({ bannerHeading, bannerBody, cardLabel, cardColor, cardHeading, cardBodyHtml, ctaText, ctaUrl, preview }) {
  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0; padding:0;}
  table{border-collapse:collapse;}
  img{border:0; height:auto; line-height:100%; outline:none; text-decoration:none;}
</style>
</head>
<body style="word-spacing:normal; background-color:#150017;">
  <div style="display:none; font-size:1px; color:#150017; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    ${preview || ''}
  </div>

  <div style="background:#150017; padding-bottom:20px;">

    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:600px; margin:0 auto;">
      <tbody>
        <tr>
          <td style="padding:20px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:16px; font-weight:800; letter-spacing:1px; color:#ffffff;">
              TIXTEE<span style="color:rgba(255,255,255,0.4); font-weight:400;">.XYZ</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px 24px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:26px; font-weight:800; line-height:32px; color:#ffffff;">
              ${bannerHeading}
            </div>
            ${bannerBody ? `<div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14.5px; font-weight:400; line-height:22px; color:rgba(255,255,255,0.8); margin-top:10px;">${bannerBody}</div>` : ''}
          </td>
        </tr>
      </tbody>
    </table>

    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:560px; margin:0 auto;">
      <tbody>
        <tr>
          <td style="border-radius:12px; background:${cardColor}; overflow:hidden;">
            <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
              <tbody>
                <tr>
                  <td style="padding:20px 20px 6px; text-align:left;">
                    <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.8);">
                      ${cardLabel}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 10px; text-align:left;">
                    <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:22px; font-weight:700; line-height:28px; color:#ffffff;">
                      ${cardHeading}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 20px; text-align:left;">
                    <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:14.5px; font-weight:400; line-height:22px; color:rgba(255,255,255,0.92);">
                      ${cardBodyHtml}
                    </div>
                  </td>
                </tr>
                ${ctaText && ctaUrl ? `
                <tr>
                  <td style="padding:0 20px 24px; text-align:right;">
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                      <tbody>
                        <tr>
                          <td align="center" bgcolor="#ffffff" style="border-radius:10px;" valign="middle">
                            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background:#ffffff; color:${cardColor}; font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:700; line-height:20px; text-decoration:none; padding:11px 22px; border-radius:10px;">
                              ${ctaText}
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>` : `<tr><td style="padding-bottom:20px;"></td></tr>`}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>

    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%; max-width:600px; margin:0 auto;">
      <tbody>
        <tr>
          <td style="padding:24px 20px 10px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; line-height:20px; color:rgba(255,255,255,0.6);">
              Have questions or need help? Email us at
              <a href="mailto:tixteedotxyz@gmail.com" style="color:#c9a8cd; text-decoration:none; font-weight:700;">tixteedotxyz@gmail.com</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 20px 20px; text-align:left;">
            <div style="font-family:'Inter',Helvetica,Arial,sans-serif; font-size:12px; font-weight:400; line-height:18px; color:rgba(255,255,255,0.35);">
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

module.exports = { buildStatusEmailHtml };