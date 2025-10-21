const UserModel = require('../model/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const AuthService = {
    
    //Register new user feature
    registerUser: async (username, email, password)=>{
        //1. Check if user already exists
        const existingUserByEmail = await UserModel.findByEmail(email);
        if(existingUserByEmail){
            throw new Error('Email already in use');
        }

        const existingUserByUsername = await UserModel.findByUsername(username);
        if(existingUserByUsername){
            throw new Error('Username already taken');
        }

        //2. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        //3. Create user
        const newUser = await UserModel.createUser(username, email, hashedPassword);
        return newUser;
    },

    //Login user feature
    loginUser: async (email, password)=>{
        //1. Find user by email
        const user = await UserModel.findByEmail(email);
        if(!user){
            throw new Error('Invalid email or password');
        }

        //2. Compare passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if(!isPasswordValid){
            throw new Error('Invalid email or password');
        }

        //3. Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        return { token, user: {
            id: user.id,
            username: user.username,
            email: user.email
        } };
    }
}

module.exports = AuthService;