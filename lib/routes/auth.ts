import {User, UTDPersonnel} from '../model/user';
import msg from '../msg';
const {types: utypes} = UTDPersonnel;

/**
 * Middleware function that will check that a user is logged in or not
 * @param req - the request object
 * @param res - the response object
 * @param next - calls next middleware in the chain.
 */
export function login(req, res, next) {
  if (req.user) {
    next();
  } else {
    res.json(msg.fail('You are not logged in!', 'nologin'));
  }
}

/**
 * Middleware function that will check that a user is a student.
 * @param req - the request object
 * @param res - the response object
 * @param next - calls next middleware in the chain.
 */
export function student(req, res, next) {
  let u: User = req.user;
  if (u && u.isUtd && u.utd.uType === utypes.STUDENT) {
    req.student = u.utd.student;
    next();
  } else {
    res.json(msg.fail('You must be a student!', 'notstudent'));
  }
}

/**
 * Middleware function that will check that a user is an employee.
 * @param req - the request object
 * @param res - the response object
 * @param next - calls next middleware in the chain.
 */
export function employee(req, res, next) {
  let u: User = req.user;
  if (u && u.isEmployee) {
    req.employee = u.employee;
    next();
  } else {
    res.json(msg.fail('You must be an employee!', 'notemployee'));
  }
}
