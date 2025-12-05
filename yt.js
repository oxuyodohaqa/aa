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
    outputFile: 'sukses.txt',
    successLogFile: 'yt_success_log.txt',
    // YouTube Student Program ID (verified correct)
    programId: '633f45d7295c0551ab43b87a',
    // YouTube verification reference URL
    youtubeStudentUrl: 'https://offers.sheerid.com/youtube/student/',
    // Timeout settings
    timeout: 30000,
    uploadTimeout: 60000,
    // Status check settings
    maxStatusChecks: 6,
    statusCheckInterval: 10000  // 10 seconds between checks
};

// MIME type mapping for file uploads
const CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
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
        console.log(chalk.blue(`📋 Using YouTube Program ID: ${CONFIG.programId}`));
        console.log(chalk.blue(`📍 Current step: Creating verification`));
        
        const data = {
            programId: CONFIG.programId,
            installPageUrl: youtubeUrl || CONFIG.youtubeStudentUrl
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
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                },
                timeout: CONFIG.timeout
            }
        );
        
        const verificationId = response.data.verificationId;
        console.log(chalk.green(`✅ YouTube verification created!`));
        console.log(chalk.green(`📋 Verification ID: ${verificationId}`));
        console.log(chalk.blue(`📍 Current step: ${response.data.currentStep}`));
        
        // Log full response for debugging
        if (response.data.segment) {
            console.log(chalk.cyan(`🎓 Segment: ${response.data.segment}`));
        }
        
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
            console.log(chalk.red(`Error Data: ${JSON.stringify(error.response.data, null, 2)}`));
        } else {
            console.log(chalk.red(`Error: ${error.message}`));
        }
        return { success: false, error: error.message };
    }
}

// DEBUG: Get verification details
async function getVerificationDetails(verificationId) {
    try {
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}`,
            {
                timeout: CONFIG.timeout,
                headers: {
                    'Accept': 'application/json',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                }
            }
        );
        console.log(chalk.cyan('🔍 Verification Details:'));
        console.log(chalk.cyan(`   Status: ${response.data.status || 'N/A'}`));
        console.log(chalk.cyan(`   Current Step: ${response.data.currentStep}`));
        console.log(chalk.cyan(`   Segment: ${response.data.segment || 'N/A'}`));
        console.log(chalk.cyan(`   Created: ${response.data.created || 'N/A'}`));
        
        // Log SSO options if present
        if (response.data.ssoOptions) {
            console.log(chalk.cyan(`   SSO Options: ${JSON.stringify(response.data.ssoOptions)}`));
        }
        
        return response.data;
    } catch (e) {
        console.log(chalk.red('❌ Failed to get verification details'));
        if (e.response) {
            console.log(chalk.red(`   Error: ${JSON.stringify(e.response.data)}`));
        }
        return null;
    }
}

// SUBMIT PERSONAL INFO FOR YOUTUBE
async function submitPersonalInfo(verificationId, student, college) {
    try {
        // Validate required fields before submission
        if (!student.firstName || !student.lastName || !student.email) {
            console.log(chalk.red('❌ Missing required student fields'));
            return { success: false, error: 'Missing required student fields' };
        }
        
        if (!college || !college.id || !college.name) {
            console.log(chalk.red('❌ Missing required college information'));
            return { success: false, error: 'Missing required college information' };
        }
        
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
        console.log(chalk.blue(`📍 Current step: collectStudentPersonalInfo`));
        console.log(chalk.cyan(`   Student: ${student.firstName} ${student.lastName}`));
        console.log(chalk.cyan(`   Organization: ${college.name} (ID: ${college.id})`));
        
        const response = await axios.post(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/collectStudentPersonalInfo`,
            data,
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                },
                timeout: CONFIG.timeout
            }
        );
        
        console.log(chalk.green(`✅ Personal info submitted!`));
        console.log(chalk.green(`📍 New step: ${response.data.currentStep}`));
        
        // Log full response for debugging if there are errors
        if (response.data.errorIds && response.data.errorIds.length > 0) {
            console.log(chalk.yellow(`⚠️ Errors: ${JSON.stringify(response.data.errorIds)}`));
        }
        
        return {
            success: true,
            currentStep: response.data.currentStep,
            data: response.data
        };
    } catch (e) {
        console.log(chalk.red('❌ Failed to submit personal info'));
        if (e.response) {
            console.log(chalk.red(`   Status: ${e.response.status}`));
            console.log(chalk.red(`   Error Data: ${JSON.stringify(e.response.data, null, 2)}`));
        } else {
            console.log(chalk.red(`   Error: ${e.message}`));
        }
        return { success: false, error: e.message };
    }
}

// CHECK STATUS
async function checkStatus(verificationId) {
    try {
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}`,
            {
                timeout: CONFIG.timeout,
                headers: {
                    'Accept': 'application/json',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                }
            }
        );
        
        console.log(chalk.blue(`📍 Current Step: ${response.data.currentStep}`));
        
        // Show more details if pending
        if (response.data.currentStep === 'pending') {
            console.log(chalk.yellow(`   ⏳ Awaiting: ${response.data.awaitingStep || 'Unknown'}`));
            console.log(chalk.yellow(`   ⏳ Estimated: ${response.data.estimatedReviewTime || 'Unknown'}`));
        }
        
        // Show rejection reasons if any
        if (response.data.rejectionReasons && response.data.rejectionReasons.length > 0) {
            console.log(chalk.red(`   ❌ Rejection Reasons: ${JSON.stringify(response.data.rejectionReasons)}`));
        }
        
        return { 
            success: true, 
            currentStep: response.data.currentStep,
            data: response.data 
        };
    } catch (e) {
        console.log(chalk.red('❌ Could not check status'));
        if (e.response) {
            console.log(chalk.red(`   Error: ${JSON.stringify(e.response.data)}`));
        }
        return { success: false, error: e.message };
    }
}

// CANCEL SSO FOR YOUTUBE
// YouTube Student verification requires Google SSO by default
// This cancels SSO to proceed with document upload instead
async function cancelSso(verificationId) {
    try {
        console.log(chalk.yellow('🔄 Cancelling SSO for YouTube...'));
        console.log(chalk.blue(`📍 Current step: sso (attempting to cancel)`));
        
        const response = await axios.delete(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/sso`,
            {
                timeout: CONFIG.timeout,
                headers: {
                    'Accept': 'application/json',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                }
            }
        );
        
        console.log(chalk.green('✅ SSO cancelled successfully'));
        console.log(chalk.green(`📍 New step: ${response.data.currentStep}`));
        
        // Log additional info for debugging
        if (response.data.currentStep === 'docUpload') {
            console.log(chalk.cyan('   📄 Ready to upload documents'));
        }
        
        return { 
            success: true, 
            currentStep: response.data.currentStep,
            data: response.data 
        };
    } catch (e) {
        console.log(chalk.red('❌ SSO cancel failed'));
        if (e.response) {
            console.log(chalk.red(`   Status: ${e.response.status}`));
            console.log(chalk.red(`   Error Data: ${JSON.stringify(e.response.data, null, 2)}`));
            
            // Check if the response still contains useful step information
            if (e.response.data && e.response.data.currentStep) {
                return { 
                    success: false, 
                    currentStep: e.response.data.currentStep,
                    data: e.response.data,
                    error: e.message 
                };
            }
        }
        return { success: false, error: e.message };
    }
}

// UPLOAD DOCUMENT
// Uploads documents with correct form data for YouTube verification
async function uploadDocument(verificationId, filePath) {
    try {
        const fileName = path.basename(filePath);
        console.log(chalk.yellow(`📤 Uploading: ${fileName}`));
        console.log(chalk.blue(`📍 Current step: docUpload`));
        
        // Check file exists and get stats
        if (!fs.existsSync(filePath)) {
            console.log(chalk.red(`   ❌ File not found: ${filePath}`));
            return { success: false, error: 'File not found' };
        }
        
        const fileStats = fs.statSync(filePath);
        console.log(chalk.cyan(`   📊 File size: ${(fileStats.size / 1024).toFixed(2)} KB`));
        
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath), {
            filename: fileName,
            contentType: getContentType(fileName),
            knownLength: fileStats.size
        });
        
        const response = await axios.post(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/docUpload`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                },
                timeout: CONFIG.uploadTimeout
            }
        );
        
        console.log(chalk.green('✅ Upload successful!'));
        console.log(chalk.green(`📍 New step: ${response.data.currentStep}`));
        
        // Log additional info
        if (response.data.uploadedDocuments) {
            console.log(chalk.cyan(`   📄 Uploaded documents: ${response.data.uploadedDocuments.length}`));
        }
        
        return { 
            success: true, 
            data: response.data,
            currentStep: response.data.currentStep 
        };
    } catch (e) {
        console.log(chalk.red('❌ Upload failed'));
        if (e.response) {
            console.log(chalk.red(`   Status: ${e.response.status}`));
            console.log(chalk.red(`   Error Data: ${JSON.stringify(e.response.data, null, 2)}`));
        } else {
            console.log(chalk.red(`   Error: ${e.message}`));
        }
        return { success: false, error: e.message };
    }
}

// Get content type based on file extension
function getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    return CONTENT_TYPES[ext] || 'application/octet-stream';
}

// GET YOUTUBE PREMIUM URL
// Retrieves the YouTube Premium activation URL after successful verification
// Handles 302 redirects properly to extract the location header
async function getYoutubePremiumUrl(verificationId) {
    try {
        console.log(chalk.yellow('🔗 Getting YouTube Premium URL...'));
        console.log(chalk.blue(`📋 Verification ID: ${verificationId}`));
        
        // Try to get redirect URL
        const response = await axios.get(
            `https://services.sheerid.com/rest/v2/verification/${verificationId}/redirect`,
            { 
                maxRedirects: 0,  // Don't follow redirects automatically
                timeout: CONFIG.timeout,
                validateStatus: (status) => status >= 200 && status < 400,
                headers: {
                    'Accept': 'application/json, text/html, */*',
                    'Origin': 'https://offers.sheerid.com',
                    'Referer': CONFIG.youtubeStudentUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                }
            }
        );
        
        // Check for location header (redirect URL)
        if (response.headers.location) {
            console.log(chalk.green(`✅ YouTube Premium URL obtained!`));
            console.log(chalk.cyan(`   📍 URL: ${response.headers.location}`));
            return { success: true, url: response.headers.location };
        }
        
        // Check if response body contains redirect URL
        if (response.data && response.data.redirectUrl) {
            console.log(chalk.green(`✅ YouTube Premium URL obtained from response!`));
            return { success: true, url: response.data.redirectUrl };
        }
        
        console.log(chalk.yellow('⚠️ No redirect URL in response'));
        console.log(chalk.cyan(`   Response status: ${response.status}`));
        
    } catch (e) {
        // Handle redirect response (302/307)
        if (e.response && e.response.headers && e.response.headers.location) {
            console.log(chalk.green(`✅ YouTube Premium URL obtained from redirect!`));
            console.log(chalk.cyan(`   📍 URL: ${e.response.headers.location}`));
            return { success: true, url: e.response.headers.location };
        }
        
        console.log(chalk.red('❌ Failed to get YouTube Premium URL'));
        if (e.response) {
            console.log(chalk.red(`   Status: ${e.response.status}`));
            console.log(chalk.red(`   Error Data: ${JSON.stringify(e.response.data, null, 2)}`));
        } else {
            console.log(chalk.red(`   Error: ${e.message}`));
        }
    }
    
    return { success: false };
}

// SAVE RESULT
function saveResult(url, verificationId, student = null) {
    try {
        // Save URL to output file
        fs.appendFileSync(CONFIG.outputFile, url + '\n');
        console.log(chalk.green(`💾 Saved to ${CONFIG.outputFile}: ${url}`));
        
        // Also log additional details for tracking
        const logEntry = {
            timestamp: new Date().toISOString(),
            verificationId: verificationId,
            url: url,
            student: student ? {
                firstName: student.firstName,
                lastName: student.lastName,
                studentId: student.studentId
            } : null
        };
        
        // Append to detailed log file
        fs.appendFileSync(CONFIG.successLogFile, JSON.stringify(logEntry) + '\n');
        
    } catch (e) {
        console.log(chalk.red('❌ Save failed'));
        console.log(chalk.red(`   Error: ${e.message}`));
    }
}

// PROCESS STUDENT FOR YOUTUBE
async function processStudent(student, collegesMap, youtubeUrl) {
    console.log(chalk.cyan(`\n🎯 Processing for YouTube: ${student.firstName} ${student.lastName}`));
    console.log(chalk.cyan(`   Student ID: ${student.studentId}`));
    
    // STEP 1: Create YouTube verification
    const verificationResult = await createYoutubeVerification(youtubeUrl);
    if (!verificationResult.success) {
        console.log(chalk.red(`❌ Failed to create verification`));
        return null;
    }
    
    const verificationId = verificationResult.verificationId;
    let currentStep = verificationResult.currentStep;
    
    console.log(chalk.green(`\n🔑 YouTube Verification ID: ${verificationId}`));
    console.log(chalk.yellow(`   ⚠️ Save this ID to check later if needed`));
    
    // Get verification details
    await getVerificationDetails(verificationId);
    
    // Find files for this student
    const files = findStudentFiles(student.studentId);
    if (files.length === 0) {
        console.log(chalk.red('❌ No files found for student'));
        console.log(chalk.blue(`📋 Verification ID for manual check: ${verificationId}`));
        return null;
    }
    
    console.log(chalk.blue(`📁 Found ${files.length} file(s) for upload`));
    
    // Get college from file
    const firstFile = files[0];
    const collegeId = getCollegeIdFromFile(student.studentId, path.basename(firstFile));
    
    if (!collegeId) {
        console.log(chalk.red('❌ Could not extract college ID from filename'));
        console.log(chalk.blue(`📋 Verification ID for manual check: ${verificationId}`));
        return null;
    }
    
    const college = collegesMap.get(collegeId);
    if (!college) {
        console.log(chalk.red(`❌ College ID ${collegeId} not found in colleges file`));
        console.log(chalk.blue(`📋 Verification ID for manual check: ${verificationId}`));
        return null;
    }
    
    console.log(chalk.blue(`🏫 College: ${college.name} (ID: ${college.id})`));
    
    // STEP 2: Submit personal info if needed
    if (currentStep === 'collectStudentPersonalInfo') {
        console.log(chalk.yellow('\n🔄 Submitting personal info...'));
        const submitResult = await submitPersonalInfo(verificationId, student, college);
        if (!submitResult.success) {
            console.log(chalk.blue(`📋 Verification ID for manual check: ${verificationId}`));
            return null;
        }
        
        currentStep = submitResult.currentStep;
        await new Promise(r => setTimeout(r, 3000));
        
        // Check current status
        const statusResult = await checkStatus(verificationId);
        if (statusResult.success) {
            currentStep = statusResult.currentStep;
        }
    }
    
    // STEP 3: Handle SSO for YouTube (cancel it to proceed with doc upload)
    if (currentStep === 'sso') {
        console.log(chalk.yellow('\n🔐 YouTube requires Google SSO, cancelling to use document upload...'));
        const ssoResult = await cancelSso(verificationId);
        
        if (ssoResult.success) {
            currentStep = ssoResult.currentStep;
        } else if (ssoResult.currentStep) {
            // Even if cancel failed, we might have a valid step
            currentStep = ssoResult.currentStep;
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        // Check status after SSO handling
        const newStatus = await checkStatus(verificationId);
        if (newStatus.success) {
            currentStep = newStatus.currentStep;
        }
    }
    
    // STEP 4: Upload document(s)
    if (currentStep === 'docUpload') {
        console.log(chalk.yellow('\n📤 Starting document upload...'));
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(chalk.blue(`\n📄 File ${i + 1}/${files.length}: ${path.basename(file)}`));
            
            const uploadResult = await uploadDocument(verificationId, file);
            
            if (uploadResult.success) {
                console.log(chalk.yellow('\n⏳ Waiting for verification review...'));
                
                // Check status multiple times with delays
                for (let check = 0; check < CONFIG.maxStatusChecks; check++) {
                    await new Promise(r => setTimeout(r, CONFIG.statusCheckInterval));
                    const status = await checkStatus(verificationId);
                    
                    if (status.currentStep === 'success') {
                        console.log(chalk.green('\n✅ YouTube verification successful!'));
                        
                        // Get YouTube Premium URL
                        const youtubeResult = await getYoutubePremiumUrl(verificationId);
                        if (youtubeResult.success) {
                            saveResult(youtubeResult.url, verificationId, student);
                            return youtubeResult.url;
                        } else {
                            console.log(chalk.yellow('⚠️ Could not retrieve redirect URL'));
                            console.log(chalk.blue(`📋 Verification ID for manual activation: ${verificationId}`));
                        }
                        break;
                        
                    } else if (status.currentStep === 'pending') {
                        console.log(chalk.yellow(`   ⏳ Still pending review... (check ${check + 1}/${CONFIG.maxStatusChecks})`));
                        
                    } else if (status.currentStep === 'error' || 
                               (status.data && status.data.rejectionReasons && status.data.rejectionReasons.length > 0)) {
                        console.log(chalk.red(`   ❌ Document rejected, trying next file if available...`));
                        break;
                        
                    } else {
                        console.log(chalk.yellow(`   📍 Current status: ${status.currentStep}`));
                        
                        // If we're back to docUpload, we can try another file
                        if (status.currentStep === 'docUpload') {
                            console.log(chalk.yellow('   📄 Ready for another document...'));
                            break;
                        }
                    }
                }
                
                // Check final status after upload checks
                const finalStatus = await checkStatus(verificationId);
                if (finalStatus.currentStep === 'success') {
                    const youtubeResult = await getYoutubePremiumUrl(verificationId);
                    if (youtubeResult.success) {
                        saveResult(youtubeResult.url, verificationId, student);
                        return youtubeResult.url;
                    }
                }
            } else {
                console.log(chalk.red(`   ❌ Upload failed for file ${i + 1}`));
            }
        }
        
        // If we get here, all uploads were attempted
        console.log(chalk.yellow('\n⚠️  Document review may still be pending. Manual verification needed.'));
        console.log(chalk.blue(`📋 Save this ID to check later: ${verificationId}`));
        
    } else if (currentStep === 'success') {
        console.log(chalk.green('\n✅ Already verified!'));
        const youtubeResult = await getYoutubePremiumUrl(verificationId);
        if (youtubeResult.success) {
            saveResult(youtubeResult.url, verificationId, student);
            return youtubeResult.url;
        }
        
    } else {
        console.log(chalk.red(`\n❌ Cannot proceed with current step: ${currentStep}`));
        console.log(chalk.blue(`📋 Verification ID for manual check: ${verificationId}`));
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