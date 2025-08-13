module.exports = async function (context, req) {
  try {
    const principalHeader = req.headers["x-ms-client-principal"];
    let email = "";
    if (principalHeader) {
      const decoded = Buffer.from(principalHeader, 'base64').toString('utf8');
      const p = JSON.parse(decoded);
      email = p?.userDetails || "";
    }

    // 简单演示：从环境变量里读取逗号分隔的白名单邮箱
    const whitelist = (process.env.APPROVED_EMAILS || "").split(',').map(s => s.trim()).filter(Boolean);
    const roles = whitelist.includes(email) ? ["approved"] : [];

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { email, roles }
    };
  } catch (e) {
    context.res = { status: 500, body: { error: e.message } };
  }
};


