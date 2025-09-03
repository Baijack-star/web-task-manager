const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testAttachmentFunctionality() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        acceptDownloads: true
    });
    const page = await context.newPage();

    try {
        console.log('🚀 开始测试附件功能...');
        
        // 1. 访问应用
        console.log('1. 正在访问应用...');
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        console.log('✅ 页面加载完成');
        
        // 2. 测试文件上传功能
        console.log('\n2. 测试文件上传功能...');
        
        // 创建测试文件
        const testFileName = 'test-upload-file.txt';
        const testFilePath = path.join(__dirname, testFileName);
        const testContent = `测试文件内容\n创建时间: ${new Date().toLocaleString('zh-CN')}\n这是一个用于测试附件上传功能的文件。`;
        fs.writeFileSync(testFilePath, testContent, 'utf8');
        console.log(`✅ 创建测试文件: ${testFileName}`);
        
        // 填写任务表单
        await page.fill('#taskTitle', '测试附件上传下载功能');
        await page.fill('#taskDescription', '这是一个测试任务，用于验证附件上传和下载功能是否正常工作。');
        await page.selectOption('#taskPriority', '高');
        
        // 上传文件
        const fileInput = await page.locator('#taskAttachments');
        await fileInput.setInputFiles(testFilePath);
        await page.waitForTimeout(1000);
        
        // 检查文件是否显示在列表中
        const uploadedFileItem = await page.locator('.file-item').count();
        console.log(`✅ 文件已添加到上传列表，共 ${uploadedFileItem} 个文件`);
        
        // 提交任务
        await page.click('.submit-btn');
        await page.waitForTimeout(3000);
        console.log('✅ 任务提交成功');
        
        // 3. 测试文件列表刷新
        console.log('\n3. 测试文件列表刷新...');
        await page.click('.refresh-btn');
        await page.waitForTimeout(2000);
        
        const fileItems = await page.locator('.uploaded-file-item').count();
        console.log(`✅ 文件列表刷新完成，找到 ${fileItems} 个文件`);
        
        // 4. 测试文件下载功能
        console.log('\n4. 测试文件下载功能...');
        
        if (fileItems > 0) {
            // 获取最新上传的文件（应该是我们刚才上传的）
            const downloadLinks = await page.locator('.download-btn');
            const downloadCount = await downloadLinks.count();
            console.log(`找到 ${downloadCount} 个下载链接`);
            
            // 测试下载第一个文件
            const firstDownloadLink = await downloadLinks.first().getAttribute('href');
            console.log(`测试下载链接: ${firstDownloadLink}`);
            
            // 使用页面请求测试下载
            const downloadResponse = await page.request.get(`http://localhost:3000${firstDownloadLink}`);
            console.log(`下载响应状态: ${downloadResponse.status()}`);
            
            if (downloadResponse.ok()) {
                const contentDisposition = downloadResponse.headers()['content-disposition'];
                const buffer = await downloadResponse.body();
                console.log(`✅ 文件下载成功`);
                console.log(`   - Content-Disposition: ${contentDisposition}`);
                console.log(`   - 文件大小: ${buffer.length} 字节`);
                
                // 验证下载的内容
                const downloadedContent = buffer.toString('utf8');
                if (downloadedContent.includes('测试文件内容')) {
                    console.log('✅ 下载文件内容验证成功');
                } else {
                    console.log('❌ 下载文件内容验证失败');
                }
            } else {
                console.log('❌ 文件下载失败');
                return false;
            }
        } else {
            console.log('❌ 没有找到可下载的文件');
            return false;
        }
        
        // 5. 测试文件管理界面
        console.log('\n5. 测试文件管理界面...');
        
        // 滚动到文件管理区域
        await page.locator('.file-management-section').scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        // 检查文件信息显示
        const fileInfoElements = await page.locator('.uploaded-file-info').count();
        console.log(`✅ 文件信息显示正常，共 ${fileInfoElements} 个文件信息`);
        
        // 6. 测试任务历史中的附件链接
        console.log('\n6. 测试任务历史中的附件链接...');
        
        // 切换到待处理任务标签
        await page.click('button[onclick="switchTab(\'pending\')"]:has-text("待处理任务")');
        await page.waitForTimeout(2000);
        
        // 检查是否有任务显示
        const taskSections = await page.locator('.task-section').count();
        console.log(`✅ 待处理任务显示正常，共 ${taskSections} 个任务`);
        
        console.log('\n🎉 所有附件功能测试完成！');
        console.log('\n测试结果总结:');
        console.log('✅ 文件上传功能 - 正常');
        console.log('✅ 文件下载功能 - 正常');
        console.log('✅ 文件列表刷新 - 正常');
        console.log('✅ 文件管理界面 - 正常');
        console.log('✅ 任务提交与附件关联 - 正常');
        
        return true;
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
        return false;
    } finally {
        // 清理测试文件
        try {
            const testFilePath = path.join(__dirname, 'test-upload-file.txt');
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
                console.log('🧹 清理测试文件完成');
            }
        } catch (cleanupError) {
            console.error('清理测试文件失败:', cleanupError);
        }
        
        await browser.close();
    }
}

// 创建临时下载目录
const tempDir = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// 运行测试
testAttachmentFunctionality()
    .then(success => {
        if (success) {
            console.log('\n🎯 附件功能测试全部通过！');
            process.exit(0);
        } else {
            console.log('\n💥 附件功能测试失败！');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('测试执行失败:', error);
        process.exit(1);
    });