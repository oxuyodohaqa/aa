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

// Common headers for SheerID API requests
const SHEERID_HEADERS = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://offers.sheerid.com',
    'Referer': 'https://offers.sheerid.com/youtube/student/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
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
                    ...SHEERID_HEADERS,
                    'Content-Type': 'application/json',
                    'Referer': youtubeUrl
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
                headers: SHEERID_HEADERS
            }
        );
        console.log(chalk.cyan(`🔍 [${verificationId}] Verification Details:`));
        console.log(chalk.cyan(`   Status: ${response.data.status || 'N/A'}`));
        console.log(chalk.cyan(`   Current Step: ${response.data.currentStep}`));
        console.log(chalk.cyan(`   Segment: ${response.data.segment || 'N/A'}`));
        console.log(chalk.cyan(`   Created: ${response.data.created || 'N/A'}`));
        return response.data;
    } catch (e) {
        console.log(chalk.red(`❌ [${verificationId}] Failed to get verification details: ${e.message}`));
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
        
        console.log(chalk.yellow(`📝 [${verificationId}] Submitting personal info for YouTube...`));
        console.log(chalk.blue(`📝 [${verificationId}] Student: ${student.firstName} ${student.lastName}`));
        console.log(chalk.blue(`📝 [${verificationId}] College: ${college.name} (ID: ${college.id})`));
        
        const response = await axios.post(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/collectStudentPersonalInfo`,
            data,
            {
                headers: {
                    ...SHEERID_HEADERS,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        console.log(chalk.green(`✅ [${verificationId}] Personal info submitted!`));
        console.log(chalk.green(`📍 [${verificationId}] New step: ${response.data.currentStep}`));
        
        return {
            success: true,
            currentStep: response.data.currentStep,
            data: response.data
        };
    } catch (e) {
        console.log(chalk.red(`❌ [${verificationId}] Failed to submit personal info`));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
            console.log(chalk.red(`Error: ${JSON.stringify(e.response.data)}`));
        } else {
            console.log(chalk.red(`Error: ${e.message}`));
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
                headers: SHEERID_HEADERS
            }
        );
        
        console.log(chalk.blue(`📍 [${verificationId}] Current Step: ${response.data.currentStep}`));
        
        // Show more details if pending
        if (response.data.currentStep === 'pending') {
            console.log(chalk.yellow(`⏳ [${verificationId}] Awaiting: ${response.data.awaitingStep || 'Unknown'}`));
            console.log(chalk.yellow(`⏳ [${verificationId}] Estimated: ${response.data.estimatedReviewTime || 'Unknown'}`));
        }
        
        return { 
            success: true, 
            currentStep: response.data.currentStep,
            data: response.data 
        };
    } catch (e) {
        console.log(chalk.red(`❌ [${verificationId}] Could not check status: ${e.message}`));
        return { success: false };
    }
}

// CANCEL SSO FOR YOUTUBE
async function cancelSso(verificationId) {
    try {
        console.log(chalk.yellow(`🔄 [${verificationId}] Cancelling SSO for YouTube...`));
        const response = await axios.delete(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/sso`,
            {
                timeout: 10000,
                headers: SHEERID_HEADERS
            }
        );
        console.log(chalk.green(`✅ [${verificationId}] SSO cancelled`));
        console.log(chalk.green(`📍 [${verificationId}] New step: ${response.data.currentStep}`));
        return { success: true, currentStep: response.data.currentStep, data: response.data };
    } catch (e) {
        console.log(chalk.red(`❌ [${verificationId}] SSO cancel failed`));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
            console.log(chalk.red(`Error: ${JSON.stringify(e.response.data)}`));
        } else {
            console.log(chalk.red(`Error: ${e.message}`));
        }
        return { success: false };
    }
}

// UPLOAD DOCUMENT
async function uploadDocument(verificationId, filePath) {
    try {
        console.log(chalk.yellow(`📤 [${verificationId}] Uploading: ${path.basename(filePath)}`));
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        
        const response = await axios.post(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/docUpload`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    ...SHEERID_HEADERS
                },
                timeout: 60000
            }
        );
        
        console.log(chalk.green(`✅ [${verificationId}] Upload successful!`));
        console.log(chalk.green(`📍 [${verificationId}] New step: ${response.data.currentStep}`));
        return { success: true, currentStep: response.data.currentStep, data: response.data };
    } catch (e) {
        console.log(chalk.red(`❌ [${verificationId}] Upload failed`));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
            console.log(chalk.red(`Error: ${JSON.stringify(e.response.data)}`));
        } else {
            console.log(chalk.red(`Error: ${e.message}`));
        }
        return { success: false };
    }
}

// GET YOUTUBE PREMIUM URL
async function getYoutubePremiumUrl(verificationId) {
    try {
        console.log(chalk.yellow(`🔗 [${verificationId}] Getting YouTube Premium URL...`));
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/redirect`,
            { 
                maxRedirects: 0, 
                timeout: 10000,
                // Accept both 2xx success codes and 3xx redirect codes to capture the location header
                validateStatus: (status) => status >= 200 && status < 400,
                headers: {
                    ...SHEERID_HEADERS,
                    'Accept': 'application/json, text/html, */*'
                }
            }
        );
        
        if (response.headers.location) {
            console.log(chalk.green(`✅ [${verificationId}] YouTube Premium URL obtained!`));
            return { success: true, url: response.headers.location };
        }
        
        // Check if redirectUrl is in the response data
        if (response.data?.redirectUrl) {
            console.log(chalk.green(`✅ [${verificationId}] YouTube Premium URL obtained from response data!`));
            return { success: true, url: response.data.redirectUrl };
        }
        
        console.log(chalk.yellow(`⚠️ [${verificationId}] No redirect URL in response`));
        return { success: false };
    } catch (e) {
        // Handle 302 redirect in error response
        if (e.response?.headers?.location) {
            console.log(chalk.green(`✅ [${verificationId}] YouTube Premium URL obtained from redirect!`));
            return { success: true, url: e.response.headers.location };
        }
        console.log(chalk.red(`❌ [${verificationId}] Failed to get YouTube Premium URL`));
        if (e.response) {
            console.log(chalk.red(`Status: ${e.response.status}`));
        } else {
            console.log(chalk.red(`Error: ${e.message}`));
        }
        return { success: false };
    }
}

// SAVE RESULT
function saveResult(url, verificationId) {
    try {
        fs.appendFileSync(CONFIG.outputFile, url + '\n');
        console.log(chalk.green(`💾 [${verificationId}] Saved to ${CONFIG.outputFile}: ${url}`));
    } catch (e) {
        console.log(chalk.red(`❌ [${verificationId}] Save failed: ${e.message}`));
    }
}

// PROCESS STUDENT FOR YOUTUBE
async function processStudent(student, collegesMap, youtubeUrl) {
    console.log(chalk.cyan(`\n🎯 Processing for YouTube: ${student.firstName} ${student.lastName}`));
    
    // STEP 1: Create YouTube verification
    const verificationResult = await createYoutubeVerification(youtubeUrl);
    if (!verificationResult.success) {
        console.log(chalk.red('❌ Failed to create verification'));
        return null;
    }
    
    const verificationId = verificationResult.verificationId;
    let currentStep = verificationResult.currentStep;
    
    console.log(chalk.green(`🔑 [${verificationId}] YouTube Verification ID obtained`));
    
    // Get verification details
    await getVerificationDetails(verificationId);
    
    // Find files
    const files = findStudentFiles(student.studentId);
    if (files.length === 0) {
        console.log(chalk.red(`❌ [${verificationId}] No files found for student ${student.studentId}`));
        return null;
    }
    
    console.log(chalk.blue(`📁 [${verificationId}] Found ${files.length} file(s)`));
    
    // Get college from file
    const firstFile = files[0];
    const collegeId = getCollegeIdFromFile(student.studentId, path.basename(firstFile));
    
    if (!collegeId) {
        console.log(chalk.red(`❌ [${verificationId}] Could not extract college ID from filename`));
        return null;
    }
    
    const college = collegesMap.get(collegeId);
    if (!college) {
        console.log(chalk.red(`❌ [${verificationId}] College ID ${collegeId} not found in database`));
        return null;
    }
    
    console.log(chalk.blue(`🏫 [${verificationId}] College: ${college.name}`));
    
    // STEP 2: Submit personal info if needed
    if (currentStep === 'collectStudentPersonalInfo') {
        console.log(chalk.yellow(`🔄 [${verificationId}] Submitting personal info...`));
        const submitResult = await submitPersonalInfo(verificationId, student, college);
        if (!submitResult.success) {
            console.log(chalk.red(`❌ [${verificationId}] Failed to submit personal info`));
            return null;
        }
        
        currentStep = submitResult.currentStep;
        await new Promise(r => setTimeout(r, 3000));
        const statusCheck = await checkStatus(verificationId);
        if (statusCheck.success) {
            currentStep = statusCheck.currentStep;
        }
    }
    
    // STEP 3: Handle SSO for YouTube
    if (currentStep === 'sso') {
        console.log(chalk.yellow(`🔐 [${verificationId}] YouTube requires Google SSO, cancelling...`));
        const ssoResult = await cancelSso(verificationId);
        if (ssoResult.success) {
            currentStep = ssoResult.currentStep;
            await new Promise(r => setTimeout(r, 2000));
            const newStatus = await checkStatus(verificationId);
            if (newStatus.success) currentStep = newStatus.currentStep;
        } else {
            console.log(chalk.red(`❌ [${verificationId}] Failed to cancel SSO`));
        }
    }
    
    // STEP 4: Upload document
    if (currentStep === 'docUpload') {
        console.log(chalk.yellow(`📤 [${verificationId}] Uploading document...`));
        
        for (const file of files) {
            console.log(chalk.blue(`📄 [${verificationId}] File: ${path.basename(file)}`));
            
            const uploadResult = await uploadDocument(verificationId, file);
            if (uploadResult.success) {
                currentStep = uploadResult.currentStep || currentStep;
                console.log(chalk.yellow(`⏳ [${verificationId}] Waiting for review (could take a few minutes)...`));
                
                // Check status multiple times with delays
                for (let i = 0; i < 5; i++) {
                    await new Promise(r => setTimeout(r, 10000));
                    const status = await checkStatus(verificationId);
                    
                    if (status.currentStep === 'success') {
                        console.log(chalk.green(`✅ [${verificationId}] YouTube verification successful!`));
                        
                        const youtubeResult = await getYoutubePremiumUrl(verificationId);
                        if (youtubeResult.success) {
                            saveResult(youtubeResult.url, verificationId);
                            return youtubeResult.url;
                        }
                        break;
                    } else if (status.currentStep === 'pending') {
                        console.log(chalk.yellow(`⏳ [${verificationId}] Still pending review... (check ${i + 1}/5)`));
                    } else if (status.currentStep === 'error') {
                        console.log(chalk.red(`❌ [${verificationId}] Verification error occurred`));
                        break;
                    } else {
                        console.log(chalk.yellow(`📍 [${verificationId}] Current step: ${status.currentStep}`));
                        if (status.currentStep !== 'docUpload') {
                            break;
                        }
                    }
                }
                
                console.log(chalk.yellow(`⚠️ [${verificationId}] Still pending after checks. Manual verification needed.`));
                console.log(chalk.blue(`📋 [${verificationId}] Save this ID to check later: ${verificationId}`));
                break;
            } else {
                console.log(chalk.yellow(`⚠️ [${verificationId}] Upload failed, trying next file if available...`));
            }
        }
    } else if (currentStep === 'success') {
        console.log(chalk.green(`✅ [${verificationId}] Already verified!`));
        const youtubeResult = await getYoutubePremiumUrl(verificationId);
        if (youtubeResult.success) {
            saveResult(youtubeResult.url, verificationId);
            return youtubeResult.url;
        }
    } else {
        console.log(chalk.red(`❌ [${verificationId}] Cannot proceed. Current step: ${currentStep}`));
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