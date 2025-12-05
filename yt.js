const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const chalk = require('chalk');
const readline = require('readline');

// CONFIG
const CONFIG = {
    studentsFile: 'students.txt',
    receiptsDir: 'receipts',
    collegesFile: 'sheerid_ph.json',
    outputFile: 'sukses.txt'
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askForYoutubeUrl() {
    return new Promise((resolve) => {
        rl.question(chalk.yellow('🔗 Enter YouTube URL: '), (answer) => {
            resolve(answer.trim());
        });
    });
}

// LOAD STUDENTS
function loadStudents() {
    try {
        const content = fs.readFileSync(CONFIG.studentsFile, 'utf-8');
        return content.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('|').map(s => s.trim());
                if (parts.length < 2) return null;
                const [name, studentId] = parts;
                const nameParts = name.split(' ');
                const firstName = nameParts[0] || 'TEST';
                const lastName = nameParts.slice(1).join(' ') || 'USER';
                return {
                    firstName: firstName.toUpperCase(),
                    lastName: lastName.toUpperCase(),
                    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 9999)}@gmail.com`,
                    studentId: studentId
                };
            })
            .filter(s => s);
    } catch (e) {
        console.log(chalk.red('❌ Error loading students'));
        return [];
    }
}

// LOAD COLLEGES
function loadColleges() {
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG.collegesFile, 'utf-8'));
        const map = new Map();
        data.forEach(c => map.set(c.id, c));
        return map;
    } catch (e) {
        console.log(chalk.red('❌ Error loading colleges'));
        return new Map();
    }
}

// FIND STUDENT FILES
function findStudentFiles(studentId) {
    if (!fs.existsSync(CONFIG.receiptsDir)) return [];
    const files = fs.readdirSync(CONFIG.receiptsDir);
    return files
        .filter(file => file.startsWith(studentId + '_') || file.startsWith('SCHEDULE_' + studentId + '_'))
        .map(file => path.join(CONFIG.receiptsDir, file));
}

// GET COLLEGE ID FROM FILE
function getCollegeIdFromFile(studentId, filename) {
    const match = filename.match(new RegExp(`${studentId}_(\\d+)\\.`));
    return match ? parseInt(match[1]) : null;
}

// CREATE VERIFICATION WITH CORRECT PROGRAM ID
async function createYoutubeVerification(youtubeUrl) {
    try {
        console.log(chalk.yellow('🚀 Creating YouTube Premium verification...'));
        console.log(chalk.blue(`📋 Using YouTube Program ID: 633f45d7295c0551ab43b87a`));
        
        const data = {
            programId: "633f45d7295c0551ab43b87a", // YOUTUBE PROGRAM ID
            installPageUrl: youtubeUrl
        };
        
        const response = await axios.post(
            'https://services.sheerid.com/rest/v2/verification/',
            data,
            {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Content-Type': 'application/json',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': youtubeUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                }
            }
        );
        
        const verificationId = response.data.verificationId;
        console.log(chalk.green(`✅ YouTube verification created!`));
        console.log(chalk.green(`📋 Verification ID: ${verificationId}`));
        console.log(chalk.blue(`📍 Current step: ${response.data.currentStep}`));
        
        return { 
            success: true, 
            verificationId: verificationId,
            currentStep: response.data.currentStep,
            data: response.data
        };
        
    } catch (error) {
        console.log(chalk.red('❌ Failed to create YouTube verification'));
        if (error.response) {
            console.log(chalk.red(`Status: ${error.response.status}`));
            console.log(chalk.red(`Error: ${JSON.stringify(error.response.data)}`));
        }
        return { success: false };
    }
}

// DEBUG: Get verification details
async function getVerificationDetails(verificationId) {
    try {
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}`,
            {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }
        );
        console.log(chalk.cyan('🔍 Verification Details:'));
        console.log(chalk.cyan(`Status: ${response.data.status}`));
        console.log(chalk.cyan(`Current Step: ${response.data.currentStep}`));
        console.log(chalk.cyan(`Segment: ${response.data.segment}`));
        console.log(chalk.cyan(`Created: ${response.data.created}`));
        return response.data;
    } catch (e) {
        console.log(chalk.red('❌ Failed to get verification details'));
        return null;
    }
}

// SUBMIT PERSONAL INFO FOR YOUTUBE
async function submitPersonalInfo(verificationId, student, college) {
    try {
        const dob = {
            year: new Date().getFullYear() - Math.floor(Math.random() * 8) - 18,
            month: Math.floor(Math.random() * 12) + 1,
            day: Math.floor(Math.random() * 28) + 1
        };
        
        const data = {
            firstName: student.firstName,
            lastName: student.lastName,
            birthDate: `${dob.year}-${dob.month.toString().padStart(2, '0')}-${dob.day.toString().padStart(2, '0')}`,
            email: student.email,
            organization: {
                id: college.id,
                name: college.name
            },
            country: 'PH',
            locale: 'en-PH'
        };
        
        console.log(chalk.yellow('📝 Submitting personal info for YouTube...'));
        
        const response = await axios.post(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/collectStudentPersonalInfo`,
            data,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 30000
            }
        );
        
        console.log(chalk.green(`✅ Personal info submitted!`));
        console.log(chalk.green(`New step: ${response.data.currentStep}`));
        
        return {
            success: true,
            currentStep: response.data.currentStep
        };
    } catch (e) {
        console.log(chalk.red('❌ Failed to submit personal info'));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
            console.log(chalk.red(`Error: ${JSON.stringify(e.response.data)}`));
        }
        return { success: false };
    }
}

// CHECK STATUS
async function checkStatus(verificationId) {
    try {
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}`,
            {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }
        );
        
        console.log(chalk.blue(`📍 Current Step: ${response.data.currentStep}`));
        
        // Show more details if pending
        if (response.data.currentStep === 'pending') {
            console.log(chalk.yellow(`⏳ Awaiting: ${response.data.awaitingStep || 'Unknown'}`));
            console.log(chalk.yellow(`⏳ Estimated: ${response.data.estimatedReviewTime || 'Unknown'}`));
        }
        
        return { 
            success: true, 
            currentStep: response.data.currentStep,
            data: response.data 
        };
    } catch (e) {
        console.log(chalk.red('❌ Could not check status'));
        return { success: false };
    }
}

// CANCEL SSO FOR YOUTUBE
async function cancelSso(verificationId) {
    try {
        console.log(chalk.yellow('🔄 Cancelling SSO for YouTube...'));
        const response = await axios.delete(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/sso`,
            {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }
        );
        console.log(chalk.green('✅ SSO cancelled'));
        console.log(chalk.green(`New step: ${response.data.currentStep}`));
        return { success: true, currentStep: response.data.currentStep };
    } catch (e) {
        console.log(chalk.red('❌ SSO cancel failed'));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
        }
        return { success: false };
    }
}

// UPLOAD DOCUMENT
async function uploadDocument(verificationId, filePath) {
    try {
        console.log(chalk.yellow(`📤 Uploading: ${path.basename(filePath)}`));
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        
        const response = await axios.post(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/docUpload`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 60000
            }
        );
        
        console.log(chalk.green('✅ Upload successful!'));
        console.log(chalk.green(`New step: ${response.data.currentStep}`));
        return { success: true, data: response.data };
    } catch (e) {
        console.log(chalk.red('❌ Upload failed'));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
            console.log(chalk.red(`Error: ${e.response.data?.message || 'Unknown error'}`));
        }
        return { success: false };
    }
}

// GET YOUTUBE PREMIUM URL
async function getYoutubePremiumUrl(verificationId) {
    try {
        console.log(chalk.yellow('🔗 Getting YouTube Premium URL...'));
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/redirect`,
            { 
                maxRedirects: 0, 
                timeout: 10000,
                validateStatus: null
            }
        );
        
        if (response.headers.location) {
            console.log(chalk.green(`✅ YouTube Premium URL obtained!`));
            return { success: true, url: response.headers.location };
        }
    } catch (e) {
        if (e.response?.headers?.location) {
            console.log(chalk.green(`✅ YouTube Premium URL obtained!`));
            return { success: true, url: e.response.headers.location };
        }
        console.log(chalk.red('❌ Failed to get YouTube Premium URL'));
    }
    return { success: false };
}

// SAVE RESULT
function saveResult(url) {
    try {
        fs.appendFileSync(CONFIG.outputFile, url + '\n');
        console.log(chalk.green(`💾 Saved to file: ${url}`));
    } catch (e) {
        console.log(chalk.red('❌ Save failed'));
    }
}

// PROCESS STUDENT FOR YOUTUBE
async function processStudent(student, collegesMap, youtubeUrl) {
    console.log(chalk.cyan(`\n🎯 Processing for YouTube: ${student.firstName} ${student.lastName}`));
    
    // STEP 1: Create YouTube verification
    const verificationResult = await createYoutubeVerification(youtubeUrl);
    if (!verificationResult.success) return null;
    
    const verificationId = verificationResult.verificationId;
    let currentStep = verificationResult.currentStep;
    
    console.log(chalk.green(`🔑 YouTube Verification ID: ${verificationId}`));
    
    // Get verification details
    await getVerificationDetails(verificationId);
    
    // Find files
    const files = findStudentFiles(student.studentId);
    if (files.length === 0) {
        console.log(chalk.red('❌ No files found'));
        return null;
    }
    
    console.log(chalk.blue(`📁 Found ${files.length} file(s)`));
    
    // Get college from file
    const firstFile = files[0];
    const collegeId = getCollegeIdFromFile(student.studentId, path.basename(firstFile));
    
    if (!collegeId) {
        console.log(chalk.red('❌ Could not extract college ID'));
        return null;
    }
    
    const college = collegesMap.get(collegeId);
    if (!college) {
        console.log(chalk.red(`❌ College ${collegeId} not found`));
        return null;
    }
    
    console.log(chalk.blue(`🏫 College: ${college.name}`));
    
    // STEP 2: Submit personal info if needed
    if (currentStep === 'collectStudentPersonalInfo') {
        console.log(chalk.yellow('🔄 Submitting personal info...'));
        const submitResult = await submitPersonalInfo(verificationId, student, college);
        if (!submitResult.success) return null;
        
        currentStep = submitResult.currentStep;
        await new Promise(r => setTimeout(r, 3000));
        await checkStatus(verificationId);
    }
    
    // STEP 3: Handle SSO for YouTube
    if (currentStep === 'sso') {
        console.log(chalk.yellow('🔐 YouTube requires Google SSO, cancelling...'));
        const ssoResult = await cancelSso(verificationId);
        if (ssoResult.success) {
            currentStep = ssoResult.currentStep;
            await new Promise(r => setTimeout(r, 2000));
            const newStatus = await checkStatus(verificationId);
            if (newStatus.success) currentStep = newStatus.currentStep;
        }
    }
    
    // STEP 4: Upload document
    if (currentStep === 'docUpload') {
        console.log(chalk.yellow('📤 Uploading document...'));
        
        for (const file of files) {
            console.log(chalk.blue(`📄 File: ${path.basename(file)}`));
            
            const uploadResult = await uploadDocument(verificationId, file);
            if (uploadResult.success) {
                console.log(chalk.yellow('⏳ Waiting for review (could take a few minutes)...'));
                
                // Check status multiple times with delays
                for (let i = 0; i < 5; i++) {
                    await new Promise(r => setTimeout(r, 10000));
                    const status = await checkStatus(verificationId);
                    
                    if (status.currentStep === 'success') {
                        console.log(chalk.green('✅ YouTube verification successful!'));
                        
                        const youtubeResult = await getYoutubePremiumUrl(verificationId);
                        if (youtubeResult.success) {
                            saveResult(youtubeResult.url);
                            return youtubeResult.url;
                        }
                        break;
                    } else if (status.currentStep === 'pending') {
                        console.log(chalk.yellow(`⏳ Still pending review... (check ${i + 1}/5)`));
                    } else {
                        console.log(chalk.yellow(`Current: ${status.currentStep}`));
                        break;
                    }
                }
                
                console.log(chalk.yellow('⚠️  Still pending after checks. Manual verification needed.'));
                console.log(chalk.blue(`📋 Save this ID to check later: ${verificationId}`));
                break;
            }
        }
    } else if (currentStep === 'success') {
        console.log(chalk.green('✅ Already verified!'));
        const youtubeResult = await getYoutubePremiumUrl(verificationId);
        if (youtubeResult.success) {
            saveResult(youtubeResult.url);
            return youtubeResult.url;
        }
    } else {
        console.log(chalk.red(`❌ Cannot proceed. Current step: ${currentStep}`));
    }
    
    return null;
}

// MAIN
async function main() {
    console.log(chalk.cyan('🎵 YouTube Premium Verification 🎵'));
    
    const youtubeUrl = await askForYoutubeUrl();
    if (!youtubeUrl) {
        console.log(chalk.red('❌ No URL provided'));
        rl.close();
        return;
    }
    
    console.log(chalk.green(`🔗 URL: ${youtubeUrl}`));
    
    const collegesMap = loadColleges();
    if (collegesMap.size === 0) {
        console.log(chalk.red('❌ No colleges loaded'));
        rl.close();
        return;
    }
    
    const students = loadStudents();
    if (students.length === 0) {
        console.log(chalk.red('❌ No students'));
        rl.close();
        return;
    }
    
    console.log(chalk.green(`👥 Students: ${students.length}`));
    
    for (const student of students) {
        console.log(chalk.cyan('\n' + '='.repeat(50)));
        const result = await processStudent(student, collegesMap, youtubeUrl);
        
        if (result) {
            console.log(chalk.green(`🎉 Success! YouTube URL: ${result}`));
        } else {
            console.log(chalk.red(`❌ Failed for ${student.firstName}`));
        }
        
        if (students.indexOf(student) < students.length - 1) {
            console.log(chalk.yellow('⏳ Waiting before next student...'));
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan('✅ Done'));
    rl.close();
}

// RUN
if (require.main === module) {
    main().catch(e => {
        console.error(chalk.red('💥 Error:'), e.message);
        rl.close();
        process.exit(1);
    });
}