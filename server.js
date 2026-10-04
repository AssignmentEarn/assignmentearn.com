const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// MongoDB Connection (Vercel ke Environment Variable se link uthayega)
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch(err => console.log("MongoDB Connection Error: ", err));

// Database Schemas
const UserSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    balance: { type: Number, default: 0 },
    planActive: { type: Boolean, default: false },
    planType: String,
    totalEarning: { type: Number, default: 0 },
    totalWithdraw: { type: Number, default: 0 },
    withdrawAccount: Object
});

const DepositSchema = new mongoose.Schema({
    userId: String,
    username: String,
    amount: Number,
    transactionId: String,
    proofImage: String,
    status: { type: String, default: "Pending" }
});

const WithdrawalSchema = new mongoose.Schema({
    userId: String,
    username: String,
    amount: Number,
    method: String,
    holderName: String,
    accountNum: String,
    status: { type: String, default: "Pending" }
});

const TaskSchema = new mongoose.Schema({
    title: String,
    reward: Number,
    targetUserId: String
});

const SubmissionSchema = new mongoose.Schema({
    taskId: String,
    userId: String,
    username: String,
    taskTitle: String,
    reward: Number,
    proofImage: String,
    notes: String,
    status: { type: String, default: "pending" }
});

const User = mongoose.model('User', UserSchema);
const Deposit = mongoose.model('Deposit', DepositSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const Task = mongoose.model('Task', TaskSchema);
const Submission = mongoose.model('Submission', SubmissionSchema);

// API Routes
app.get('/api/data', async (req, res) => {
    try {
        let users = await User.find();
        let deposits = await Deposit.find();
        let withdrawals = await Withdrawal.find();
        let tasks = await Task.find();
        let submissions = await Submission.find();
        res.json({ success: true, data: { users, deposits, withdrawals, tasks, submissions } });
    } catch (err) {
        res.json({ success: false, message: "Error fetching data" });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        let { username, email, password } = req.body;
        let existing = await User.findOne({ $or: [{ username }, { email }] });
        if (existing) return res.json({ success: false, message: "Username or Email already exists!" });

        let newUser = new User({ username, email, password, balance: 0 });
        await newUser.save();
        res.json({ success: true, user: { id: newUser._id, username: newUser.username } });
    } catch (err) {
        res.json({ success: false, message: "Registration failed" });
    }
});

app.post('/api/invest', async (req, res) => {
    try {
        let { userId, planType } = req.body;
        let user = await User.findById(userId);
        let cost = planType === 'plan3' ? 2000 : (planType === 'plan2' ? 1000 : 500);

        if (user.balance < cost) return res.json({ success: false, message: "Insufficient balance!" });

        user.balance -= cost;
        user.planActive = true;
        user.planType = planType;
        await user.save();
        res.json({ success: true, message: "Plan activated successfully!" });
    } catch (err) {
        res.json({ success: false, message: "Action failed" });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        let { userId, amount, transactionId, proofImage } = req.body;
        let user = await User.findById(userId);
        let newDep = new Deposit({ userId, username: user.username, amount, transactionId, proofImage });
        await newDep.save();
        res.json({ success: true, message: "Deposit submitted successfully!" });
    } catch (err) {
        res.json({ success: false, message: "Deposit failed" });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        let { userId, amount } = req.body;
        let user = await User.findById(userId);
        if (amount < 100) return res.json({ success: false, message: "Minimum withdrawal is 100." });
        if (user.balance < amount) return res.json({ success: false, message: "Insufficient balance!" });

        user.balance -= amount;
        user.totalWithdraw = (user.totalWithdraw || 0) + amount;
        await user.save();

        let newWit = new Withdrawal({
            userId, username: user.username, amount,
            method: user.withdrawAccount.method,
            holderName: user.withdrawAccount.holderName,
            accountNum: user.withdrawAccount.accountNum
        });
        await newWit.save();
        res.json({ success: true, message: "Withdrawal request submitted!" });
    } catch (err) {
        res.json({ success: false, message: "Withdrawal failed" });
    }
});

app.post('/api/save-account', async (req, res) => {
    try {
        let { userId, method, holderName, accountNum } = req.body;
        let user = await User.findById(userId);
        user.withdrawAccount = method ? { method, holderName, accountNum } : null;
        await user.save();
        res.json({ success: true, message: "Account settings updated!" });
    } catch (err) {
        res.json({ success: false, message: "Failed to update account" });
    }
});

app.post('/api/submit-task', async (req, res) => {
    try {
        let { taskId, userId, proofImage, notes } = req.body;
        let user = await User.findById(userId);
        let task = await Task.findById(taskId);
        let sub = new Submission({
            taskId, userId, username: user.username,
            taskTitle: task.title, reward: task.reward, proofImage, notes
        });
        await sub.save();
        res.json({ success: true, message: "Assignment proof submitted!" });
    } catch (err) {
        res.json({ success: false, message: "Submission failed" });
    }
});

app.post('/api/admin/action', async (req, res) => {
    try {
        let { endpoint, id } = req.body;
        if (endpoint === 'approve-deposit') {
            let dep = await Deposit.findById(id);
            if (dep && dep.status === "Pending") {
                dep.status = "Approved";
                await dep.save();
                let user = await User.findById(dep.userId);
                if (user) {
                    user.balance += dep.amount;
                    user.totalEarning = (user.totalEarning || 0) + dep.amount;
                    await user.save();
                }
            }
        } else if (endpoint === 'reject-deposit') {
            await Deposit.findByIdAndUpdate(id, { status: "Rejected" });
        } else if (endpoint === 'approve-withdrawal') {
            await Withdrawal.findByIdAndUpdate(id, { status: "Approved" });
        } else if (endpoint === 'reject-withdrawal') {
            let wit = await Withdrawal.findById(id);
            if (wit && wit.status === "Pending") {
                wit.status = "Rejected";
                await wit.save();
                let user = await User.findById(wit.userId);
                if (user) { user.balance += wit.amount; await user.save(); }
            }
        } else if (endpoint === 'approve-submission') {
            let sub = await Submission.findById(id);
            if (sub && sub.status === "pending") {
                sub.status = "approved";
                await sub.save();
                let user = await User.findById(sub.userId);
                if (user) {
                    user.balance += sub.reward;
                    user.totalEarning = (user.totalEarning || 0) + sub.reward;
                    await user.save();
                }
            }
        } else if (endpoint === 'reject-submission') {
            await Submission.findByIdAndUpdate(id, { status: "rejected" });
        } else if (endpoint === 'delete-user') {
            await User.findByIdAndDelete(id);
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: "Action failed" });
    }
});

app.post('/api/admin/publish-task', async (req, res) => {
    try {
        let { title, reward, targetUserId } = req.body;
        let newTask = new Task({ title, reward, targetUserId });
        await newTask.save();
        res.json({ success: true, message: "Assignment published successfully!" });
    } catch (err) {
        res.json({ success: false, message: "Failed to publish task" });
    }
});

// Static files serve karne ke liye
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
