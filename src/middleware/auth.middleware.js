import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Access token required' 
    });
  }


  

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(403).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }
    
    req.user = {
      userId: user.id, 
      phone: user.phone,
      isVerified: user.isVerified,
      userType: user.userType,
      ...user
    };
    
    next();
  });
};