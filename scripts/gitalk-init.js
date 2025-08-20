const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const BLOG_URL = hexo.config.url;
const TOKEN = hexo.config.gitalk.autoGenerateIssueToken

hexo.on('generateAfter', async () => {
  console.info('generateAfter ...')

  const OWNER = hexo.config.gitalk.owner;
  const REPO = hexo.config.gitalk.repo;
  const AUTO_GENERATE = hexo.config.gitalk.autoGenerateIssue;
  console.info('gitalk issue init...')
  console.info(OWNER, REPO, BLOG_URL)


  if (!AUTO_GENERATE) {
    console.info('⚪️ 已禁用自动创建 Gitalk Issue（autoGenerateIssue: false）');
    return;
  }

  if (!TOKEN) {
    console.error('⚠️ 请设置 GH_TOKEN 环境变量');
    return;
  }

  const sitemapPath = path.join(hexo.public_dir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error('⚠️ sitemap.xml 不存在，请确认 Hexo 配置正确并已生成。');
    return;
  }

  const xmlContent = fs.readFileSync(sitemapPath, 'utf8');
  const urls = [];
  const re = /<loc>(.*?)<\/loc>/g;
  let m;
  while ((m = re.exec(xmlContent))) {
    urls.push(m[1]);
  }

  const filtered = urls.filter(u => u.startsWith(BLOG_URL) && !u.endsWith('/404.html'));

// 处理额外页面
const extraPages = hexo.config.gitalk.extraPages || [];
for (const page of extraPages) {
  const fullUrl = BLOG_URL.replace(/\/$/, '') + page;
  if (!filtered.includes(fullUrl)) {
    filtered.push(fullUrl);
  }
}
  for (const url of filtered) {
    const pathname = url.replace(BLOG_URL, '');
    const title = path.basename(pathname) || pathname;
    const id = crypto.createHash('md5').update(pathname).digest('hex');
    const issueTitle = `Gitalk 评论：${title}`;
    const body = `自动创建的评论 Issue，用于页面：\n${url}`;
    const data = {
      title: issueTitle,
      body,
      labels: ['Gitalk', id]
    };
    console.info(data)

    // 判断是否存在同 label 的 issue（用 label 来确保唯一性）
    const existingIssuesResp = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/issues`,
      {
        headers: {
          Authorization: `token ${TOKEN}`,
          'User-Agent': 'GitalkInitScript'
        },
        params: {
          labels: id,
          state: 'all' // 包括 closed 的也要查
        }
      }
    );

    if (existingIssuesResp.data.length > 0) {
      console.log(`⚪️ Issue already exists for ${pathname}`);
      continue; // 跳过，不再创建
    }

    try {
      const resp = await axios.post(
        `https://api.github.com/repos/${OWNER}/${REPO}/issues`,
        data,
        {
          headers: {
            Authorization: `token ${TOKEN}`,
            'User-Agent': 'GitalkInitScript'
          }
        }
      );
      console.log(`✅ Issue created for ${pathname}: ${resp.data.html_url}`);
    } catch (err) {
      if (err.response && err.response.status === 422) {
        console.log(`⚪️ Issue already exists for ${pathname}`);
      } else {
        console.error(`❌ Failed for ${pathname}:`, err.response?.data || err.message);
      }
    }
  }
});