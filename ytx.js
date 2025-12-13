// complete-yt-sheerid-single.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const chalk = require('chalk');
const readline = require('readline');
const { Telegraf } = require('telegraf');
const PDFDocument = require('pdfkit');
const { faker } = require('@faker-js/faker');

// Initialize readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// CONFIGURATION
const CONFIG = {
    receiptsDir: 'receipts',
    studentsFile: 'students.txt',
    collegesFile: 'sheerid_ph.json',
    outputFile: 'success.txt',
    debugFile: 'debug.log',
    countryCode: 'PH',  // Philippines only for YouTube
    botToken: process.env.BOT_TOKEN || '8241046676:AAF5WEG9zTR7Tobc5qIROzn7tj474NGai1I',
    adminId: Number(process.env.ADMIN_ID || 7680006005),
    autoReceiptQuantity: Number(process.env.RECEIPT_QUANTITY || 1)
};

// COLORS FOR LOGGING
const colors = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    request: chalk.cyan,
    receipt: chalk.magenta
};

const stripAnsi = (text) => text.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');

// ==================== RECEIPT GENERATOR (REPLACES PYTHON) ====================
class ReceiptGenerator {
    constructor() {
        this.receiptsDir = CONFIG.receiptsDir;
        this.studentsFile = CONFIG.studentsFile;
        this.colleges = [];
        this.stats = {
            receipts_generated: 0,
            students_saved: 0
        };
        
        // Create directories
        this.createDirectories();
        
        // Clean previous data
        this.clearAllData();
        
        // Philippines-specific configuration
        this.countryConfig = {
            'name': 'Philippines',
            'code': 'ph',
            'currency': 'PHP',
            'currency_symbol': '₱',
            'academic_terms': ['First Semester 2025-2026', 'Second Semester 2026-2027', 'Summer 2026'],
            'date_format': '%B %d, %Y',
            'tuition_range': [40000, 100000],
            'fees_range': [4000, 10000]
        };
    }
    
    createDirectories() {
        if (!fs.existsSync(this.receiptsDir)) {
            fs.mkdirSync(this.receiptsDir, { recursive: true });
        }
    }
    
    clearAllData() {
        try {
            if (fs.existsSync(this.receiptsDir)) {
                const files = fs.readdirSync(this.receiptsDir);
                for (const file of files) {
                    if (file.endsWith('.pdf') || file.endsWith('.txt')) {
                        fs.unlinkSync(path.join(this.receiptsDir, file));
                    }
                }
            }
            
            if (fs.existsSync(this.studentsFile)) {
                fs.unlinkSync(this.studentsFile);
            }
            
            console.log(colors.success('🗑️  All previous data cleared!'));
        } catch (e) {
            console.log(colors.warning(`⚠️  Cleanup warning: ${e.message}`));
        }
    }
    
    loadColleges() {
        try {
            if (!fs.existsSync(CONFIG.collegesFile)) {
                console.log(colors.error(`❌ College file not found: ${CONFIG.collegesFile}`));
                this.colleges = this.getDefaultColleges();
                return;
            }
            
            const data = JSON.parse(fs.readFileSync(CONFIG.collegesFile, 'utf-8'));
            this.colleges = data.map(c => ({
                id: c.id.toString(),
                name: c.name,
                type: c.type || 'UNIVERSITY'
            }));
            
            console.log(colors.success(`✅ Loaded ${this.colleges.length} colleges`));
        } catch (e) {
            console.log(colors.error(`❌ Error loading colleges: ${e.message}`));
            this.colleges = this.getDefaultColleges();
        }
    }
    
    getDefaultColleges() {
        console.log(colors.warning('⚠️  Using default colleges'));
        return [
            { id: '1', name: 'University of the Philippines', type: 'UNIVERSITY' },
            { id: '2', name: 'Ateneo de Manila University', type: 'UNIVERSITY' },
            { id: '3', name: 'De La Salle University', type: 'UNIVERSITY' },
            { id: '4', name: 'University of Santo Tomas', type: 'UNIVERSITY' },
            { id: '5', name: 'Polytechnic University of the Philippines', type: 'UNIVERSITY' }
        ];
    }
    
    cleanName(name) {
        return name.replace(/[.,]/g, '')
                   .replace(/\b(Drs?|Ir|H|Prof|S|M|Bapak|Ibu)\b/gi, '')
                   .replace(/\s+/g, ' ')
                   .trim();
    }
    
    generatePaymentData() {
        const [tuition_min, tuition_max] = this.countryConfig.tuition_range;
        const [fees_min, fees_max] = this.countryConfig.fees_range;
        
        const tuition_amount = Math.floor(Math.random() * (tuition_max - tuition_min + 1)) + tuition_min;
        const fees_amount = Math.floor(Math.random() * (fees_max - fees_min + 1)) + fees_min;
        const total_amount = tuition_amount + fees_amount;
        
        const payment_methods = ["Credit Card", "Bank Transfer", "Online Payment", "Scholarship", "Financial Aid"];
        const transaction_id = `TX${Math.floor(100000 + Math.random() * 900000)}`;
        
        // Generate payment date (within last 30 days)
        const payment_date = new Date();
        payment_date.setDate(payment_date.getDate() - Math.floor(Math.random() * 30));
        
        return {
            tuition_amount,
            fees_amount,
            total_amount,
            payment_method: payment_methods[Math.floor(Math.random() * payment_methods.length)],
            transaction_id,
            payment_date
        };
    }
    
    generateStudentData(college) {
        // Generate Filipino names using Faker
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const fullName = this.cleanName(`${firstName} ${lastName}`);
        const studentId = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // Current/upcoming dates
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        
        // Generate dates for current or upcoming semester
        let date_issued, first_day, last_day, exam_week, academic_term;
        
        if (currentDate.getMonth() >= 0 && currentDate.getMonth() <= 5) { // Jan-Jun
            date_issued = new Date(currentYear, 0, 15);
            first_day = new Date(currentYear, 0, 15);
            last_day = new Date(currentYear, 5, 15);
            exam_week = new Date(currentYear, 5, 20);
            academic_term = "Second Semester 2024-2025";
        } else { // Jul-Dec
            date_issued = new Date(currentYear, 6, 1);
            first_day = new Date(currentYear, 6, 1);
            last_day = new Date(currentYear, 11, 15);
            exam_week = new Date(currentYear, 11, 20);
            academic_term = "First Semester 2025-2026";
        }
        
        // Philippine university programs
        const programs = [
            "Computer Science", 
            "Business Administration", 
            "Engineering", 
            "Nursing", 
            "Education",
            "Accountancy",
            "Information Technology",
            "Psychology",
            "Medical Technology",
            "Pharmacy"
        ];
        
        const payment_data = this.generatePaymentData();
        
        return {
            full_name: fullName,
            student_id: studentId,
            college: college,
            program: programs[Math.floor(Math.random() * programs.length)],
            academic_term: academic_term,
            date_issued: date_issued,
            first_day: first_day,
            last_day: last_day,
            exam_week: exam_week,
            country_config: this.countryConfig,
            payment_data: payment_data,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 99)}@gmail.com`
        };
    }
    
    formatCurrency(amount) {
        const symbol = this.countryConfig.currency_symbol;
        return `${symbol}${amount.toLocaleString('en-PH')}`;
    }
    
    formatDate(date) {
        return date.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    createTuitionReceiptPDF(studentData) {
        const college = studentData.college;
        const studentId = studentData.student_id;
        const collegeId = college.id;
        
        const filename = `TUITION_${studentId}_${collegeId}.pdf`;
        const filepath = path.join(this.receiptsDir, filename);
        
        try {
            const doc = new PDFDocument({ margin: 50 });
            const writeStream = fs.createWriteStream(filepath);
            doc.pipe(writeStream);
            
            // Header
            doc.fontSize(20)
               .fillColor('#1e3a8a')
               .text('OFFICIAL TUITION RECEIPT', { align: 'center' })
               .moveDown(0.5);
            
            doc.fontSize(16)
               .fillColor('#2563eb')
               .text(college.name, { align: 'center' })
               .moveDown(1);
            
            // Receipt info
            doc.fontSize(10)
               .fillColor('#6b7280')
               .text(`Receipt Date: ${this.formatDate(studentData.date_issued)} | Transaction ID: ${studentData.payment_data.transaction_id}`, { align: 'center' })
               .moveDown(1);
            
            // Student Information
            doc.fontSize(14)
               .fillColor('#1e3a8a')
               .text('Student Information', { underline: true })
               .moveDown(0.5);
            
            const studentInfo = [
                `Full Name: ${studentData.full_name}`,
                `Student ID: ${studentData.student_id}`,
                `Academic Program: ${studentData.program}`,
                `Current Semester: ${studentData.academic_term}`,
                `Enrollment Status: Full-Time Active`
            ];
            
            studentInfo.forEach(info => {
                doc.fontSize(11)
                   .fillColor('#1f2937')
                   .text(info)
                   .moveDown(0.3);
            });
            
            doc.moveDown(1);
            
            // Payment Details
            doc.fontSize(14)
               .fillColor('#1e3a8a')
               .text('Payment Details', { underline: true })
               .moveDown(0.5);
            
            const paymentInfo = [
                ['Tuition Fee', this.formatCurrency(studentData.payment_data.tuition_amount)],
                ['University Fees', this.formatCurrency(studentData.payment_data.fees_amount)],
                ['', ''],
                ['TOTAL PAID', this.formatCurrency(studentData.payment_data.total_amount)]
            ];
            
            // Payment table
            const startY = doc.y;
            paymentInfo.forEach(([desc, amount], i) => {
                if (i === 0) {
                    doc.fillColor('#1e3a8a')
                       .rect(50, doc.y, 500, 25)
                       .fill();
                    doc.fillColor('white')
                       .fontSize(12)
                       .text(desc, 60, doc.y + 5, { width: 240 })
                       .text(amount, 300, doc.y + 5, { width: 200, align: 'right' });
                } else if (i === paymentInfo.length - 1) {
                    doc.fillColor('#059669')
                       .rect(50, doc.y, 500, 25)
                       .fill();
                    doc.fillColor('white')
                       .fontSize(12)
                       .font('Helvetica-Bold')
                       .text(desc, 60, doc.y + 5, { width: 240 })
                       .text(amount, 300, doc.y + 5, { width: 200, align: 'right' });
                } else {
                    doc.fillColor(i % 2 === 0 ? '#f3f4f6' : 'white')
                       .rect(50, doc.y, 500, 25)
                       .fill();
                    doc.fillColor('#1f2937')
                       .fontSize(11)
                       .text(desc, 60, doc.y + 5, { width: 240 })
                       .text(amount, 300, doc.y + 5, { width: 200, align: 'right' });
                }
                doc.y += 25;
            });
            
            doc.moveDown(1);
            
            // Payment Method
            doc.fontSize(10)
               .fillColor('#6b7280')
               .text(`Payment Method: ${studentData.payment_data.payment_method} | Paid on: ${this.formatDate(studentData.payment_data.payment_date)}`)
               .moveDown(1);
            
            // Semester Dates
            doc.fontSize(14)
               .fillColor('#1e3a8a')
               .text('Semester Information', { underline: true })
               .moveDown(0.5);
            
            const semesterInfo = [
                `First Day of Classes: ${this.formatDate(studentData.first_day)}`,
                `Last Day of Classes: ${this.formatDate(studentData.last_day)}`,
                `Final Exams: ${this.formatDate(studentData.exam_week)}`
            ];
            
            semesterInfo.forEach(info => {
                doc.fontSize(11)
                   .fillColor('#1f2937')
                   .text(info)
                   .moveDown(0.3);
            });
            
            doc.moveDown(2);
            
            // Verification Footer
            doc.fontSize(9)
               .fillColor('#6b7280')
               .text(`VERIFIED | ${college.name} | Student Status: ACTIVE | This receipt is valid for student verification purposes.`, { align: 'center' })
               .moveDown(0.5);
            
            doc.fontSize(8)
               .fillColor('#059669')
               .text('OFFICIAL UNIVERSITY RECEIPT • VALID FOR VERIFICATION', { align: 'center' });
            
            doc.end();
            
            writeStream.on('finish', () => {
                console.log(colors.receipt(`📄 Created tuition receipt: ${filename}`));
            });
            
            return filename;
            
        } catch (e) {
            console.log(colors.error(`❌ Error creating PDF: ${e.message}`));
            return null;
        }
    }
    
    createClassSchedulePDF(studentData) {
        const college = studentData.college;
        const studentId = studentData.student_id;
        const collegeId = college.id;

        const filename = `SCHEDULE_${studentId}_${collegeId}.pdf`;
        const filepath = path.join(this.receiptsDir, filename);

        try {
            const doc = new PDFDocument({ margin: 50 });
            const writeStream = fs.createWriteStream(filepath);
            doc.pipe(writeStream);

            // Header
            doc.fontSize(18)
               .fillColor('#0f172a')
               .text(college.name.toUpperCase(), { align: 'center' })
               .moveDown(0.2);

            doc.fontSize(11)
               .fillColor('#475569')
               .text('Office of the University Registrar', { align: 'center' })
               .text('Official Class Schedule & Enrollment Certification', { align: 'center' })
               .moveDown(1);

            // Student Information
            const infoBoxY = doc.y;
            doc.roundedRect(45, infoBoxY, 520, 90, 6)
               .fillAndStroke('#f8fafc', '#e2e8f0');

            doc.fillColor('#0f172a')
               .fontSize(12)
               .text(`Student Name: ${studentData.full_name}`, 60, infoBoxY + 12)
               .text(`Student ID: ${studentData.student_id}`, 60, infoBoxY + 32)
               .text(`Program: ${studentData.program}`, 60, infoBoxY + 52)
               .text(`Academic Term: ${studentData.academic_term}`, 320, infoBoxY + 12)
               .text(`Status: Enrolled (Full-Time)`, 320, infoBoxY + 32)
               .text(`Date Issued: ${this.formatDate(studentData.date_issued)}`, 320, infoBoxY + 52);

            doc.moveDown(5);

            // Class Schedule
            doc.fontSize(13)
               .fillColor('#0f172a')
               .text('Class Schedule', { underline: true })
               .moveDown(0.5);

            const courses = this.generateCourses(studentData.program);
            const headers = ['Course', 'Description', 'Days', 'Time', 'Room', 'Instructor', 'Units'];
            const colWidths = [70, 140, 50, 90, 60, 90, 30];

            let y = doc.y;
            doc.fillColor('#0f172a')
               .rect(45, y, 520, 24)
               .fill();

            let x = 50;
            headers.forEach((header, i) => {
                doc.fillColor('white')
                   .font('Helvetica-Bold')
                   .fontSize(9)
                   .text(header, x, y + 7, { width: colWidths[i] });
                x += colWidths[i];
            });

            y += 24;

            let totalUnits = 0;
            courses.forEach((course, i) => {
                const units = course.units || 3;
                totalUnits += units;

                doc.fillColor(i % 2 === 0 ? '#ffffff' : '#f8fafc')
                   .rect(45, y, 520, 22)
                   .fill();

                x = 50;
                const rowData = [
                    course.code,
                    course.name,
                    course.days,
                    course.time,
                    course.room,
                    course.instructor,
                    units.toString()
                ];

                rowData.forEach((text, j) => {
                    doc.fillColor('#0f172a')
                       .font('Helvetica')
                       .fontSize(9)
                       .text(text, x, y + 6, { width: colWidths[j] });
                    x += colWidths[j];
                });

                y += 22;
            });

            doc.y = y + 15;

            // Enrollment summary
            doc.fontSize(11)
               .fillColor('#0f172a')
               .text(`Total Registered Units: ${totalUnits}`, { continued: true })
               .text('   |   Academic Standing: Good', { align: 'left' })
               .moveDown(0.5)
               .text(`Class Period: ${this.formatDate(studentData.first_day)} to ${this.formatDate(studentData.last_day)}`)
               .text(`Final Examination Week: ${this.formatDate(studentData.exam_week)}`)
               .moveDown(1.5);

            // Certification
            doc.roundedRect(45, doc.y, 520, 60, 6)
               .stroke('#94a3b8');

            const certY = doc.y + 12;
            doc.fillColor('#0f172a')
               .fontSize(10)
               .text('This is to certify that the student named above is officially enrolled in the courses listed and is in good standing for the stated academic term.', 60, certY, { width: 480 });

            doc.fontSize(10)
               .text('Registrar: Maria L. Santos', 60, certY + 28)
               .text('Registrar Seal: ______________________', 330, certY + 28);

            doc.moveDown(3);

            // Footer
            doc.fontSize(8)
               .fillColor('#475569')
               .text(`${college.name} • Registrar Office • Official Class Schedule for Verification Purposes`, { align: 'center' });

            doc.end();

            writeStream.on('finish', () => {
                console.log(colors.receipt(`📅 Created class schedule: ${filename}`));
            });

            return filename;

        } catch (e) {
            console.log(colors.error(`❌ Error creating schedule PDF: ${e.message}`));
            return null;
        }
    }
    
    generateCourses(program) {
        const coursesByProgram = {
            "Computer Science": [
                { code: "CS101", name: "Introduction to Programming", days: "MWF", time: "09:00-09:50", room: "CSB-201", instructor: "Dr. Smith" },
                { code: "CS201", name: "Data Structures", days: "TTH", time: "10:30-11:45", room: "CSB-305", instructor: "Prof. Johnson" },
                { code: "MATH151", name: "Calculus I", days: "MWF", time: "11:00-11:50", room: "MATH-102", instructor: "Dr. Lee" },
                { code: "CS301", name: "Algorithms", days: "TTH", time: "13:00-14:15", room: "CSB-410", instructor: "Prof. Garcia" },
                { code: "PHYS101", name: "Physics I", days: "MWF", time: "14:00-14:50", room: "SCI-205", instructor: "Dr. Brown" }
            ],
            "Business Administration": [
                { code: "BUS101", name: "Introduction to Business", days: "MWF", time: "09:00-09:50", room: "BUS-101", instructor: "Prof. Wilson" },
                { code: "ACC201", name: "Financial Accounting", days: "TTH", time: "10:30-11:45", room: "BUS-205", instructor: "Dr. Martinez" },
                { code: "MKT301", name: "Marketing Principles", days: "MWF", time: "11:00-11:50", room: "BUS-310", instructor: "Prof. Davis" },
                { code: "FIN401", name: "Corporate Finance", days: "TTH", time: "13:00-14:15", room: "BUS-415", instructor: "Dr. Thompson" },
                { code: "MGT351", name: "Organizational Behavior", days: "MWF", time: "14:00-14:50", room: "BUS-320", instructor: "Prof. Anderson" }
            ]
        };
        
        return coursesByProgram[program] || coursesByProgram["Computer Science"];
    }
    
    saveStudent(studentData) {
        try {
            const line = `${studentData.full_name}|${studentData.student_id}|${studentData.college.id}|${studentData.college.name}|${CONFIG.countryCode}|${studentData.academic_term}|${studentData.date_issued.toISOString().split('T')[0]}|${studentData.first_day.toISOString().split('T')[0]}|${studentData.last_day.toISOString().split('T')[0]}\n`;
            
            fs.appendFileSync(this.studentsFile, line);
            this.stats.students_saved++;
            return true;
        } catch (e) {
            console.log(colors.error(`❌ Error saving student: ${e.message}`));
            return false;
        }
    }
    
    async generateReceipts(quantity) {
        console.log(colors.receipt(`\n⚡ Generating ${quantity} receipts for Philippines...`));
        
        this.loadColleges();
        
        if (this.colleges.length === 0) {
            console.log(colors.error('❌ No colleges available'));
            return false;
        }
        
        const startTime = Date.now();
        
        for (let i = 0; i < quantity; i++) {
            try {
                // Select random college
                const college = this.colleges[Math.floor(Math.random() * this.colleges.length)];
                
                // Generate student data
                const studentData = this.generateStudentData(college);
                
                // Create both PDFs
                const receiptFile = this.createTuitionReceiptPDF(studentData);
                const scheduleFile = this.createClassSchedulePDF(studentData);
                
                if (receiptFile && scheduleFile) {
                    this.saveStudent(studentData);
                    this.stats.receipts_generated++;
                    
                    console.log(colors.success(`✅ Generated ${i + 1}/${quantity}: ${studentData.full_name}`));
                } else {
                    console.log(colors.error(`❌ Failed to generate for student ${i + 1}`));
                }
                
                // Small delay to avoid overwhelming
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (e) {
                console.log(colors.error(`❌ Error generating receipt ${i + 1}: ${e.message}`));
            }
        }
        
        const duration = (Date.now() - startTime) / 1000;
        const rate = quantity / duration * 60;
        
        console.log(colors.receipt('\n' + '═'.repeat(70)));
        console.log(colors.receipt('✅ GENERATION COMPLETE'));
        console.log(colors.receipt('═'.repeat(70)));
        console.log(colors.receipt(`⏱️  Time: ${duration.toFixed(1)}s`));
        console.log(colors.receipt(`⚡ Speed: ${rate.toFixed(0)} receipts/minute`));
        console.log(colors.receipt(`📄 Generated: ${this.stats.receipts_generated}/${quantity}`));
        console.log(colors.receipt(`📁 Folder: ${this.receiptsDir}/`));
        console.log(colors.receipt(`📋 Students: ${this.studentsFile}`));
        console.log(colors.receipt('═'.repeat(70)));
        
        return this.stats.receipts_generated > 0;
    }
}

// ==================== TELEGRAM BOT MODE ====================
async function startTelegramBot(app) {
    const bot = new Telegraf(CONFIG.botToken);

    console.log(colors.info('\n🤖 Starting Telegram bot mode'));
    console.log(colors.info(`👑 Admin ID: ${CONFIG.adminId}`));
    console.log(colors.info(`📄 Auto receipt quantity: ${CONFIG.autoReceiptQuantity}`));

    const captureLogs = async (fn) => {
        const buffer = [];
        const originalLog = console.log;
        let capturedError = null;

        console.log = (...args) => {
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
            buffer.push(stripAnsi(message));
            originalLog(...args);
        };

        try {
            await fn();
        } catch (error) {
            capturedError = error;
            buffer.push(`Error: ${error.message}`);
        } finally {
            console.log = originalLog;
        }

        return { logText: buffer.join('\n') || 'No logs generated.', error: capturedError };
    };

    const sendLogMessages = async (ctx, logText) => {
        if (!logText.trim()) {
            return;
        }

        const maxLength = 3500; // keep under Telegram 4096 limit with formatting
        const chunks = [];
        for (let i = 0; i < logText.length; i += maxLength) {
            chunks.push(logText.slice(i, i + maxLength));
        }

        for (let i = 0; i < chunks.length; i++) {
            const header = chunks.length > 1 ? `🧾 Automation log (${i + 1}/${chunks.length})` : '🧾 Automation log';
            await ctx.reply(`${header}\n\n\`\`\`${chunks[i]}\`\`\``);
        }
    };

    bot.start((ctx) => {
        if (ctx.from.id !== CONFIG.adminId) {
            return ctx.reply('❌ Unauthorized');
        }

        ctx.reply('Send a YouTube verification link to start automation.');
    });

    bot.on('text', async (ctx) => {
        if (ctx.from.id !== CONFIG.adminId) {
            return ctx.reply('❌ Unauthorized');
        }

        const link = ctx.message.text.trim();
        if (!link.startsWith('http')) {
            return ctx.reply('Please send a valid link.');
        }

        await ctx.reply('🚀 Starting automation...');

        let logText = '';
        const { logText: collectedLogs, error } = await captureLogs(async () => {
            const qty = 1; // enforce 1 link = 1 student
            await app.receiptGenerator.generateReceipts(qty);
            await app.sheerIDSubmitter.submitAll(link, { maxStudents: 1 });
        });

        logText = collectedLogs;

        if (error) {
            console.log(colors.error(`💥 Bot error: ${error.message}`));
            await ctx.reply('❌ Automation failed. Check server logs.');
        } else {
            await ctx.reply('✅ Automation finished. Data cleared for next link.');
        }

        app.receiptGenerator.clearAllData();
        await sendLogMessages(ctx, logText || 'No logs generated.');
    });

    await bot.launch();

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    console.log(colors.success('✅ Bot is running. Send a link to trigger automation.'));
}

// ==================== SHEERID SUBMITTER ====================
class SheerIDSubmitter {
    constructor() {
        this.colleges = new Map();
    }
    
    loadColleges() {
        try {
            if (!fs.existsSync(CONFIG.collegesFile)) {
                console.log(colors.error(`❌ College file not found: ${CONFIG.collegesFile}`));
                return new Map();
            }
            
            const data = JSON.parse(fs.readFileSync(CONFIG.collegesFile, 'utf-8'));
            data.forEach(c => this.colleges.set(c.id.toString(), c));
            
            console.log(colors.success(`✅ Loaded ${this.colleges.size} colleges`));
            return this.colleges;
        } catch (e) {
            console.log(colors.error(`❌ Error loading colleges: ${e.message}`));
            return new Map();
        }
    }
    
    loadStudents() {
        try {
            if (!fs.existsSync(CONFIG.studentsFile)) {
                console.log(colors.error('❌ No students.txt file found'));
                return [];
            }
            
            const content = fs.readFileSync(CONFIG.studentsFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            
            const students = lines.map((line, index) => {
                const parts = line.split('|').map(s => s.trim());
                if (parts.length < 2) return null;
                
                const fullName = parts[0];
                const studentId = parts[1];
                const nameParts = fullName.split(' ');
                const firstName = nameParts[0] || 'Student';
                const lastName = nameParts.slice(1).join(' ') || 'User';
                
                return {
                    index: index + 1,
                    firstName: firstName,
                    lastName: lastName,
                    fullName: fullName,
                    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 99)}@gmail.com`,
                    studentId: studentId
                };
            }).filter(s => s !== null);
            
            console.log(colors.success(`✅ Loaded ${students.length} students`));
            return students;
        } catch (e) {
            console.log(colors.error(`❌ Error loading students: ${e.message}`));
            return [];
        }
    }
    
    getFilePriority(filePath) {
        const basename = path.basename(filePath).toLowerCase();

        if (basename.includes('tuition')) return 0;
        if (basename.includes('schedule')) return 1;
        return 2;
    }

    prioritizeDocuments(files) {
        return files.sort((a, b) => this.getFilePriority(a) - this.getFilePriority(b));
    }

    findStudentFiles(studentId) {
        if (!fs.existsSync(CONFIG.receiptsDir)) {
            return [];
        }

        const files = fs.readdirSync(CONFIG.receiptsDir);
        return files.filter(file => {
            return file.includes(`_${studentId}_`) || file.includes(`${studentId}_`);
        }).map(file => path.join(CONFIG.receiptsDir, file));
    }
    
    getCollegeIdFromFile(studentId, filename) {
        const basename = path.basename(filename);
        const patterns = [
            new RegExp(`${studentId}_(\\d+)\\.`),
            new RegExp(`_${studentId}_(\\d+)\\.`)
        ];
        
        for (const pattern of patterns) {
            const match = basename.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    }
    
    async createVerification(youtubeUrl) {
        try {
            console.log(colors.request('\n🔍 Creating verification...'));
            
            const urlObj = new URL(youtubeUrl);
            const params = {};
            for (const [key, value] of urlObj.searchParams) {
                params[key] = value;
            }
            
            const endUserId = params.endUserId || `user_${Math.random().toString(36).substring(2, 15)}`;
            
            const postData = {
                programId: "633f45d7295c0551ab43b87a",
                metadata: {
                    endUserId: endUserId,
                    oid: params.oid || "",
                    ytpid: params.ytpid || "premium",
                    ytsku: params.ytsku || "premium",
                    successRedirect: params.yrsp || params.successRedirect || "",
                    uploadRedirect: params.yrdup || params.uploadRedirect || "",
                    reverification: params.reverification || "false",
                    marketConsentValue: params.marketConsentValue || "false",
                    refererUrl: params.refererUrl || "https://www.youtube.com/",
                    submissionOptIn: params.submissionOptIn || "true",
                    
                    // Additional fields
                    utm_source: "youtube",
                    euid: params.euid || "",
                    locale: params.locale || "en-GB",
                    successUrl: params.yrsp || "",
                    redirectUrl: params.yrdup || ""
                }
            };
            
            console.log(colors.info(`🔑 endUserId: ${endUserId}`));
            
            const response = await axios.post(
                'https://services.sheerid.com/rest/v2/verification/',
                postData,
                {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': postData.metadata.refererUrl
                    },
                    timeout: 30000
                }
            );
            
            if (response.data && response.data.verificationId) {
                console.log(colors.success(`✅ Verification created! ID: ${response.data.verificationId}`));
                return {
                    verificationId: response.data.verificationId,
                    metadata: postData.metadata
                };
            }
            
            return null;
        } catch (error) {
            console.log(colors.error(`❌ Error creating verification: ${error.message}`));
            return null;
        }
    }
    
    async submitPersonalInfo(verificationId, student, college) {
        try {
            console.log(colors.request('\n📝 Submitting personal info...'));
            
            // Generate birth date (18-26 years old)
            const dob = {
                year: new Date().getFullYear() - (18 + Math.floor(Math.random() * 9)),
                month: Math.floor(Math.random() * 12) + 1,
                day: Math.floor(Math.random() * 28) + 1
            };
            
            const postData = {
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
            
            console.log(colors.info(`👤 Student: ${student.fullName}`));
            console.log(colors.info(`🎓 College: ${college.name}`));
            
            const response = await axios.post(
                `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/collectStudentPersonalInfo`,
                postData,
                {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 30000
                }
            );
            
            console.log(colors.success(`✅ Personal info submitted!`));
            return { success: true, currentStep: response.data.currentStep };
        } catch (error) {
            console.log(colors.error(`❌ Failed to submit personal info: ${error.message}`));
            return { success: false };
        }
    }
    
    async cancelSso(verificationId) {
        try {
            console.log(colors.warning('🔄 Cancelling SSO...'));
            
            await axios.delete(
                `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/sso`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                }
            );
            
            console.log(colors.success('✅ SSO cancelled'));
            return { success: true };
        } catch (error) {
            console.log(colors.warning('⚠️ SSO might already be cancelled'));
            return { success: true };
        }
    }
    
    async checkStatus(verificationId) {
        try {
            const response = await axios.get(
                `https://services.sheerid.com/rest/v2/verification/${verificationId}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                }
            );
            
            return {
                success: true,
                currentStep: response.data.currentStep,
                status: response.data.status
            };
        } catch (error) {
            return { success: false };
        }
    }
    
    async uploadDocument(verificationId, filePath) {
        try {
            console.log(colors.request(`📤 Uploading: ${path.basename(filePath)}`));
            
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            
            const response = await axios.post(
                `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/docUpload`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 60000
                }
            );
            
            console.log(colors.success(`✅ Document uploaded!`));
            return { success: true, currentStep: response.data.currentStep };
        } catch (error) {
            console.log(colors.error(`❌ Failed to upload document: ${error.message}`));
            return { success: false };
        }
    }
    
    async getYoutubeRedirectUrl(verificationId) {
        try {
            console.log(colors.request('🔗 Getting YouTube redirect URL...'));
            
            const response = await axios.get(
                `https://services.sheerid.com/rest/v2/verification/${verificationId}/redirect`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    maxRedirects: 0,
                    timeout: 10000,
                    validateStatus: (status) => status >= 200 && status < 400
                }
            );
            
            if (response.headers.location) {
                console.log(colors.success(`✅ YouTube URL obtained!`));
                return { success: true, url: response.headers.location };
            }
            
            return { success: false };
        } catch (error) {
            if (error.response && error.response.headers.location) {
                console.log(colors.success(`✅ YouTube URL obtained from error response!`));
                return { success: true, url: error.response.headers.location };
            }
            console.log(colors.error('❌ Failed to get YouTube URL'));
            return { success: false };
        }
    }
    
    async waitForVerification(verificationId, maxAttempts = 15) {
        console.log(colors.info('⏳ Waiting for verification...'));
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const status = await this.checkStatus(verificationId);
            if (!status.success) {
                await this.sleep(3000);
                continue;
            }
            
            if (status.currentStep === 'sso') {
                await this.cancelSso(verificationId);
                await this.sleep(2000);
                continue;
            }
            
            if (status.currentStep === 'success' || status.status === 'COMPLETE') {
                console.log(colors.success('🎉 Verification successful!'));
                return { success: true };
            }
            
            if (status.status === 'REJECTED' || status.status === 'FAILED') {
                console.log(colors.error(`❌ Verification failed: ${status.status}`));
                return { success: false };
            }
            
            await this.sleep(3000);
        }
        
        console.log(colors.error('❌ Verification timeout'));
        return { success: false };
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    saveSuccess(verificationId, youtubeUrl, student) {
        try {
            const entry = `${new Date().toISOString()} | ${verificationId} | ${student.fullName} | ${youtubeUrl || 'NO_URL'}\n`;
            fs.appendFileSync(CONFIG.outputFile, entry);
            
            if (youtubeUrl) {
                fs.appendFileSync('youtube_urls.txt', youtubeUrl + '\n');
            }
            
            console.log(colors.success('💾 Results saved!'));
        } catch (e) {
            console.log(colors.error('❌ Failed to save results'));
        }
    }
    
    async processStudent(student, youtubeUrl) {
        console.log(colors.info('\n' + '═'.repeat(50)));
        console.log(colors.info(`🎓 Processing: ${student.fullName}`));
        console.log(colors.info('═'.repeat(50)));
        
        // Step 1: Create verification
        const verificationData = await this.createVerification(youtubeUrl);
        if (!verificationData) return null;
        
        // Step 2: Find files and get college
        const files = this.prioritizeDocuments(this.findStudentFiles(student.studentId));
        if (files.length === 0) {
            console.log(colors.error('❌ No files found'));
            return null;
        }

        const firstFile = files[0];
        const collegeId = this.getCollegeIdFromFile(student.studentId, path.basename(firstFile));
        if (!collegeId) {
            console.log(colors.error('❌ Could not extract college ID'));
            return null;
        }
        
        const college = this.colleges.get(collegeId);
        if (!college) {
            console.log(colors.error(`❌ College ID ${collegeId} not found`));
            return null;
        }
        
        // Step 3: Submit personal info
        const personalResult = await this.submitPersonalInfo(verificationData.verificationId, student, college);
        if (!personalResult.success) return null;
        
        await this.sleep(2000);
        
        // Step 4: Check status and handle SSO
        let status = await this.checkStatus(verificationData.verificationId);
        if (status.currentStep === 'sso') {
            await this.cancelSso(verificationData.verificationId);
            await this.sleep(2000);
            status = await this.checkStatus(verificationData.verificationId);
        }
        
        // Step 5: Upload document if needed
        if (status.currentStep === 'docUpload') {
            let uploadedCount = 0;

            for (const file of files) {
                const uploadStatus = await this.checkStatus(verificationData.verificationId);
                if (uploadStatus.success && uploadStatus.currentStep !== 'docUpload') {
                    console.log(colors.info('ℹ️  Verification moved past document upload; skipping remaining files'));
                    break;
                }

                const uploadResult = await this.uploadDocument(verificationData.verificationId, file);
                if (uploadResult.success) {
                    uploadedCount++;
                    await this.sleep(2000);
                } else {
                    console.log(colors.error('❌ Stopping uploads due to failure'));
                    break;
                }
            }

            if (uploadedCount === 0) {
                console.log(colors.error('❌ No documents were uploaded successfully'));
                return null;
            }

            // Step 6: Wait for verification after uploading all files
            const verifyResult = await this.waitForVerification(verificationData.verificationId);
            if (verifyResult.success) {
                // Step 7: Get YouTube URL
                const youtubeResult = await this.getYoutubeRedirectUrl(verificationData.verificationId);

                // Save results
                this.saveSuccess(verificationData.verificationId, youtubeResult.url, student);

                if (youtubeResult.url) {
                    console.log(colors.success(`🎉 SUCCESS! YouTube URL: ${youtubeResult.url}`));
                    return youtubeResult.url;
                } else {
                    console.log(colors.success('✅ Verification successful!'));
                    return verificationData.verificationId;
                }
            }
        }
        
        console.log(colors.error('❌ Verification failed'));
        return null;
    }
    
    async submitAll(youtubeUrl, options = {}) {
        console.log(colors.info('\n🌐 Starting SheerID submission...'));

        this.loadColleges();
        const students = this.loadStudents();
        const maxStudents = options.maxStudents ? Math.max(1, options.maxStudents) : null;
        const limitedStudents = maxStudents ? students.slice(0, maxStudents) : students;

        if (limitedStudents.length === 0 || this.colleges.size === 0) {
            console.log(colors.error('❌ No data to submit'));
            return { success: 0, total: 0 };
        }

        let successCount = 0;
        const youtubeUrls = [];

        for (const student of limitedStudents) {
            const result = await this.processStudent(student, youtubeUrl);

            if (result) {
                successCount++;
                youtubeUrls.push(result);
                console.log(colors.success(`✅ Success for ${student.fullName}`));
            } else {
                console.log(colors.error(`❌ Failed for ${student.fullName}`));
            }

            // Wait between students
            if (limitedStudents.indexOf(student) < limitedStudents.length - 1) {
                console.log(colors.warning('⏳ Waiting 3 seconds...'));
                await this.sleep(3000);
            }
        }
        
        console.log(colors.info('\n' + '═'.repeat(60)));
        console.log(colors.info('📊 SUBMISSION RESULTS'));
        console.log(colors.info(`✅ Successful: ${successCount}/${limitedStudents.length}`));
        console.log(colors.info(`🔗 YouTube URLs: ${youtubeUrls.length}`));
        console.log(colors.info('═'.repeat(60)));

        return { success: successCount, total: limitedStudents.length };
    }
}

// ==================== MAIN APPLICATION ====================
class YTSheerIDApp {
    constructor() {
        this.receiptGenerator = new ReceiptGenerator();
        this.sheerIDSubmitter = new SheerIDSubmitter();
    }
    
    showMenu() {
        console.log(colors.info('\n' + '═'.repeat(60)));
        console.log(colors.info('🎓 YOUTUBE SHEERID COMPLETE AUTOMATION'));
        console.log(colors.info('═'.repeat(60)));
        console.log(colors.info('1. 📄 Generate Receipts Only'));
        console.log(colors.info('2. 🌐 Submit to SheerID Only'));
        console.log(colors.info('3. 🚀 Generate & Submit Automatically'));
        console.log(colors.info('4. 📊 View Statistics'));
        console.log(colors.info('5. 🚪 Exit'));
        console.log(colors.info('═'.repeat(60)));
    }
    
    askQuestion(question) {
        return new Promise((resolve) => {
            rl.question(colors.info(question + ' '), (answer) => {
                resolve(answer.trim());
            });
        });
    }
    
    async generateOnly() {
        const answer = await this.askQuestion('🔢 How many receipts to generate? (1-100):');
        const quantity = parseInt(answer);
        
        if (isNaN(quantity) || quantity < 1 || quantity > 100) {
            console.log(colors.error('❌ Please enter a number between 1 and 100'));
            return;
        }
        
        console.log(colors.receipt(`\n📄 Generating ${quantity} receipts...`));
        await this.receiptGenerator.generateReceipts(quantity);
    }
    
    async submitOnly() {
        const youtubeUrl = await this.askQuestion('🔗 Enter YouTube SheerID URL:');
        
        if (!youtubeUrl) {
            console.log(colors.error('❌ No URL provided'));
            return;
        }
        
        await this.sheerIDSubmitter.submitAll(youtubeUrl);
    }
    
    async generateAndSubmit() {
        // Get quantity
        const qtyAnswer = await this.askQuestion('🔢 How many receipts to generate? (1-50):');
        const quantity = parseInt(qtyAnswer);
        
        if (isNaN(quantity) || quantity < 1 || quantity > 50) {
            console.log(colors.error('❌ Please enter a number between 1 and 50'));
            return;
        }
        
        // Get YouTube URL
        const youtubeUrl = await this.askQuestion('🔗 Enter YouTube SheerID URL:');
        
        if (!youtubeUrl) {
            console.log(colors.error('❌ No URL provided'));
            return;
        }
        
        console.log(colors.info('\n' + '═'.repeat(60)));
        console.log(colors.info('🚀 STARTING COMPLETE AUTOMATION'));
        console.log(colors.info('═'.repeat(60)));
        
        // Step 1: Generate receipts
        console.log(colors.receipt('\n📄 STEP 1: Generating receipts...'));
        const genSuccess = await this.receiptGenerator.generateReceipts(quantity);
        
        if (!genSuccess) {
            console.log(colors.error('❌ Failed to generate receipts'));
            return;
        }
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 2: Submit to SheerID
        console.log(colors.request('\n🌐 STEP 2: Submitting to SheerID...'));
        await this.sheerIDSubmitter.submitAll(youtubeUrl);
        
        console.log(colors.success('\n✅ COMPLETE AUTOMATION FINISHED!'));
    }
    
    viewStatistics() {
        console.log(colors.info('\n📊 SYSTEM STATISTICS'));
        console.log(colors.info('═'.repeat(40)));
        
        // Check receipts directory
        if (fs.existsSync(CONFIG.receiptsDir)) {
            const files = fs.readdirSync(CONFIG.receiptsDir);
            const pdfFiles = files.filter(f => f.endsWith('.pdf'));
            console.log(colors.info(`📄 PDF Files: ${pdfFiles.length}`));
        } else {
            console.log(colors.warning('📁 Receipts directory: Not created'));
        }
        
        // Check students file
        if (fs.existsSync(CONFIG.studentsFile)) {
            const content = fs.readFileSync(CONFIG.studentsFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            console.log(colors.info(`👥 Students: ${lines.length}`));
        } else {
            console.log(colors.warning('📋 Students file: Not created'));
        }
        
        // Check output file
        if (fs.existsSync(CONFIG.outputFile)) {
            const content = fs.readFileSync(CONFIG.outputFile, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            console.log(colors.info(`✅ Success records: ${lines.length}`));
        }
        
        console.log(colors.info('═'.repeat(40)));
    }
    
    async run() {
        console.clear();
        console.log(colors.info('\n' + '═'.repeat(60)));
        console.log(colors.info('🎬 YOUTUBE SHEERID AUTOMATION'));
        console.log(colors.info('📄 Receipt Generator + 🌐 SheerID Submitter'));
        console.log(colors.info('🇵🇭 Philippines Universities Only'));
        console.log(colors.info('═'.repeat(60)));
        
        while (true) {
            this.showMenu();
            const choice = await this.askQuestion('\nSelect option (1-5):');
            
            switch (choice) {
                case '1':
                    await this.generateOnly();
                    break;
                case '2':
                    await this.submitOnly();
                    break;
                case '3':
                    await this.generateAndSubmit();
                    break;
                case '4':
                    this.viewStatistics();
                    break;
                case '5':
                    console.log(colors.info('\n👋 Goodbye!'));
                    rl.close();
                    return;
                default:
                    console.log(colors.error('❌ Invalid choice'));
            }
            
            // Wait before showing menu again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// ==================== INSTALLATION CHECK ====================
function checkDependencies() {
    const requiredPackages = ['axios', 'pdfkit', '@faker-js/faker', 'telegraf'];
    const missingPackages = [];
    
    for (const pkg of requiredPackages) {
        try {
            require.resolve(pkg);
        } catch (e) {
            missingPackages.push(pkg);
        }
    }
    
    if (missingPackages.length > 0) {
        console.log(colors.error('\n❌ Missing dependencies:'));
        console.log(colors.error(`Please install: npm install ${missingPackages.join(' ')}`));
        return false;
    }
    
    return true;
}

// ==================== MAIN EXECUTION ====================
async function main() {
    // Check dependencies
    if (!checkDependencies()) {
        process.exit(1);
    }

    // Create the application
    const app = new YTSheerIDApp();

    // If a bot token is configured, run in Telegram mode
    if (CONFIG.botToken) {
        await startTelegramBot(app);
        rl.close();
        return;
    }
    
    // Handle exit
    process.on('SIGINT', () => {
        console.log(colors.info('\n\n👋 Stopped by user'));
        rl.close();
        process.exit(0);
    });
    
    // Run the application
    try {
        await app.run();
    } catch (error) {
        console.log(colors.error(`\n💥 Fatal error: ${error.message}`));
        rl.close();
        process.exit(1);
    }
}

// Start the application
main();