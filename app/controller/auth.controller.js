const AuthService = require('../services/auth.service');

const AuthController = {
    
    //Register
    register: async(req, res)=>{
        try{
            const { username, email, password } = req.body;

            //Validation
            if(!username || !email || !password){
                return res.status(400).json({ error: 'All fields are required' });
            };
            if(password.length < 6){
                return res.status(400).json({ error: 'Password must be at least 6 characters long' });
            }

            const user = await AuthService.registerUser(username, email, password);
            res.status(201).json({ message: 'User registered successfully', user });

        } catch(error){
            res.status(400).json({ error: error.message });
        }
    },

    //Login
    login: async(req, res)=>{
        try{
            const { email, password } = req.body;

            //Validation
            if(!email || !password){
                return res.status(400).json({ error: 'Email and password are required' });
            };

            const result = await AuthService.loginUser(email, password);
            res.status(200).json({ message: 'Login successful', ...result });
        }catch(error){
            res.status(400).json({ error: error.message });
        };
    }
}

module.exports = AuthController;