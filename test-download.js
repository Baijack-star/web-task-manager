const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testFileDownload() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        acceptDownloads: true
    });
    const page = await context.newPage();

    try {
        console.log('正在访问应用...');
        await page.goto('http://localhost:3000');
        
        // 等待页面加载完成
        await page.waitForLoadState('networkidle');
        console.log('页面加载完成');
        
        // 滚动到文件管理区域
        console.log('滚动到文件管理区域...');
        await page.locator('.file-management-section').scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        // 检查文件列表是否加载
        console.log('检查文件列表...');
        const fileItems = await page.locator('.uploaded-file-item').count();
        console.log(`找到 ${fileItems} 个文件`);
        
        if (fileItems > 0) {
            // 测试下载第一个文件
            console.log('测试下载第一个文件...');
            
            // 获取第一个下载链接
            const firstDownloadLink = await page.locator('.download-btn').first().getAttribute('href');
            console.log(`下载链接: ${firstDownloadLink}`);
            
            // 直接访问下载链接测试
            const downloadResponse = await page.request.get(`http://localhost:3000${firstDownloadLink}`);
            console.log(`下载响应状态: ${downloadResponse.status()}`);
            
            if (downloadResponse.ok()) {
                const contentDisposition = downloadResponse.headers()['content-disposition'];
                console.log(`Content-Disposition: ${contentDisposition}`);
                
                const buffer = await downloadResponse.body();
                console.log(`✅ 文件下载成功，大小: ${buffer.length} 字节`);
            } else {
                console.log('❌ 文件下载失败');
            }
        } else {
            console.log('⚠️ 没有找到可下载的文件');
        }
        
        // 测试刷新文件列表功能
        console.log('测试刷新文件列表功能...');
        await page.click('.refresh-btn');
        await page.waitForTimeout(2000);
        
        const refreshedFileItems = await page.locator('.uploaded-file-item').count();
        console.log(`刷新后找到 ${refreshedFileItems} 个文件`);
        
        console.log('✅ 所有测试完成');
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
    } finally {
        await browser.close();
    }
}

// 创建临时下载目录
const tempDir = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// 运行测试
testFileDownload().catch(console.error);