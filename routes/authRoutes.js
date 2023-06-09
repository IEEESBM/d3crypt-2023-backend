const { Router } = require("express");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const sessionstorage = require("sessionstorage");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { checkIsVerified, checkJWT } = require("../middleware/authMiddleware");
const res = require("express/lib/response");
const verifyTemplate = require("../mail-templates/verify-template");
const passwordTemplate = require("../mail-templates/password-template");
const verifiedPage = require("../mail-templates/verified-page");
const JWT_SECRET = "decryptjwtsecret";

const router = Router();

/* *********************************************************** */

const handleErrors = (error) => {

  let errorMessage = {
    username: "",
    email: "",
    password: "",
    phone: "",
    ID: "",
    mem: "",
    verify: "",
  };
  // wrong email/password during login error
  if (error.message === "incorrect email") {
    errorMessage.email = "Invalid Email Id";
  }
  if (error.message === "incorrect password") {
    errorMessage.password = "Password is Incorrect";
  }
  if (error.message === "not verified") {
    errorMessage.verify = "Account is not Verified";
  }

  // username/email not available during signup error
  if (error.code === 11000) {
    if (error.keyValue.username) {
      errorMessage.username = "That username is not available";
    }
    if (error.keyValue.email) {
      errorMessage.email = "That email is already registered";
    }
    if (error.keyValue.phone) {
      errorMessage.phone = "This phone number is already registered";
    }
    if (error.keyValue.mem) {
      errorMessage.mem = "Please choose one option";
    }
  }

  // validation failed during signup error
  if (error.message.includes("users validation failed")) {
    Object.values(error.errors).forEach((err) => {
      errorMessage[err.properties.path] = err.properties.message;
    });
  }

  return errorMessage;
};

/* *********************************************************** */

const maxAge = 3 * 24 * 60 * 60;
const createToken = (id) => {
  return jwt.sign({ id }, "jwt secret", {
    expiresIn: maxAge,
  });
};

/* *********************************************************** */

router.get("/", checkIsVerified, checkJWT, async (req, res) => {
  res.send("home page");
});

/* *********************************************************** */

router.get('/check-verified', checkIsVerified, checkJWT, async (req, res) => {
  res.send("allow_access");
})

router.get('/user', checkJWT, checkIsVerified, async (req, res) => {
  try {
    // const token = sessionstorage.getItem('jwt');
    // let token = req.headers['x-access-token'];
    // var base64Payload = token.split('.')[1];
    // var payload = Buffer.from(base64Payload, 'base64');
    var userID = req.userId;
    var user = await User.findOne({ _id: userID });
    return res.json(user)

  } catch (error) {
    return res.json({ error: error.message });
  }

})
/* *********************************************************** */

router.get("/signup", (req, res) => {
  res.send("signup page");
});

/* *********************************************************** */

router.post("/signup", async (req, res) => {
  const {
    username,
    email,
    password,
    phone,
    college,
    ID,
    mem,
    memNo,
  } = req.body;

  try {
    const user = await User.create({
      username,
      email,
      password,
      phone,
      college,
      ID,
      mem,
      memNo,
      isVerified: true,
    });
    const token = createToken(user._id);
    // sessionstorage.setItem("jwt", token);


    // var transporter = nodemailer.createTransport({
    //   host: "smtp-mail.outlook.com", // hostname
    //   port: 465,
    //   secure: false,
    //   auth: {
    //     user: "",
    //     pass: ""
    //   }
    // });

    // const verifyLink = `https://d3crypt-2023.netlify.app/verify-email?uid=${user._id}`
    // const message = verifyTemplate(username, verifyLink, email);

    // const options = {
    //   from: "arshiaputhran@outlook.com",
    //   to: email,
    //   subject: "Email Verification",
    //   text: `go to this link: `,
    //   html: message,
    // };

    // transporter.sendMail(options, function (err, info) {
    //   if (err) {
    //     console.log(err);
    //     return;
    //   }
    //   console.log("verification email sent");
    // });

    // res.status(201).json(user);
    res.status(201).json(token);
  } catch (error) {
    let errorMessage = handleErrors(error);
    // res.status(400).json({ errorMessage, 'err': error.toString() })
    res.status(400).json({ errorMessage });
  }
});

/* *********************************************************** */

router.get("/verify-email", async (req, res) => {
  try {
    // let token = req.headers['x-access-token'];
    // console.log(token);
    // var base64Payload = token.split('.')[1];
    // var payload = Buffer.from(base64Payload, 'base64');
    // var userID = JSON.parse(payload.toString()).id;
    var userID = req.query.uid;
    const user = await User.findOne({ _id: userID });
    if (!user) {
    } else {
      await user
        .updateOne({ isVerified: true })
        .then();
    }
    res.send(verifiedPage());
  } catch (error) {
    res.send("verification failed");
  }
});

/* *********************************************************** */

router.get("/login", (req, res) => {
  res.send("login page");
});

/* *********************************************************** */

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.login(email, password);
    const token = createToken(user._id);
    sessionstorage.setItem("jwt", token);

    res.status(200).json(token);
  } catch (error) {
    let errorMessage = handleErrors(error);

    res.status(400).json(errorMessage);
  }
});

/* *********************************************************** */

router.post("/forgot", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).lean();
  if (!user) {
    return res.json({
      status: "error",
      error: "User does not exist!",
      data: "",
    });
  } else if (user.isVerified == false) {
    return res.json({
      status: "error",
      error: "User is not verified!",
      data: "",
    });
  } else {
    const secret = JWT_SECRET + user.password;
    const payload = {
      email: user.email,
      id: user._id,
    };
    const token = jwt.sign(payload, secret, { expiresIn: "15m" });

    const link = `https://d3crypt-2023.netlify.app/reset/${token}`;
    // const link = `http://${req.headers.host}/reset-password?uid=${user._id}`;


    var transporter = nodemailer.createTransport({
      host: "smtp-mail.outlook.com", // hostname
      port: 465,
      secure: false,
      auth: {
        user: "user",
        pass: "pass"
      },
    });

    const message = passwordTemplate(user.username, link, email);
    const options = {
      from: "arshiaputhran@outlook.com",
      to: email,
      subject: "password reset link",
      text: `go to this link: `,
      // html: `<a href=${link}>click to reset password</a>`,
      html: message,
    };

    transporter.sendMail(options, function (err, info) {
      if (err) {
        return;
      }
      res.json({ status: "success", error: "", data: "" });
    });
  }
});

router.patch("/reset", async (req, res) => {
  const { token, newPass } = req.body;
  // const user = await User.findOne({ id }).lean();
  // if (!user) {
  //   return res.json({
  //     status: "error",
  //     error: "User does not exist!",
  //     data: "",
  //   });
  // } else 
  if (!token) {
    return res.json({
      status: "error",
      error: "No valid token!",
      data: "",
    });
  } else {
    try {
      var base64Payload = token.split('.')[1];
      var payload = Buffer.from(base64Payload, 'base64');
      var id = JSON.parse(payload.toString()).id;
      const hash_password = await bcrypt.hash(newPass, 10);
      const updatedUser = await User.updateOne(
        { _id: id },
        {
          $set: {
            password: hash_password,
          },
        }
      );
      res.json({ status: "success", error: "", data: updatedUser });
    } catch (error) {
      res.json({ status: "error", error: error.message, data: "" });
    }
  }
});

router.post("/get-user", checkIsVerified, checkJWT, async (req, res) => {
  // var { uid } = req.body;

  try {
    // console.log(uid);
    const user = await User.findOne({ _id: req.userId });
    return res.status(200).json(user);
  } catch (error) {
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    return res.json(user);
  } catch (err) {
  }
});

router.get("/user", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    res.json(user);
  } catch (err) {
  }
});

module.exports = router;


