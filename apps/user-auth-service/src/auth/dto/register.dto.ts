import { IsEmail, IsString, MinLength, Matches, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'universityDomain', async: false })
export class UniversityDomainValidator implements ValidatorConstraintInterface {
  validate(email: string, args: ValidationArguments) {
    if (!email) return false;
    const domain = process.env.UNIVERSITY_EMAIL_DOMAIN;
    if (!domain) return true; // fallback if not set
    return email.endsWith(`@${domain}`);
  }

  defaultMessage(args: ValidationArguments) {
    return `Email must belong to ${process.env.UNIVERSITY_EMAIL_DOMAIN}`;
  }
}

export class RegisterDto {
  @IsEmail()
  @Validate(UniversityDomainValidator)
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;
}
