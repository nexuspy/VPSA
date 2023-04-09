import "reflect-metadata";
import { Users } from "../dbConnector";
import { User } from "../models/User";
import {
  Arg,
  Ctx,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "type-graphql";
import argon2 from "argon2";
import { MyContext } from "../types";
import { DocumentType } from "@typegoose/typegoose";

const mapUserToSimplifiedUser = (user: DocumentType<User>): SimplifiedUser => {
  return {
    isCertified: user.isCertified,
    username: user.username,
  };
};

interface SimplifiedUser {
  isCertified: boolean;
  username: string;
}
@ObjectType()
class FieldError {
  @Field()
  field!: string;

  @Field()
  message!: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: SimplifiedUser;
}

@Resolver()
export class UserResolver {
  @Query(() => UserResponse, { nullable: true })
  async logout(@Ctx() { res }: MyContext) {
    res.clearCookie("qid");
    return null;
  }

  @Query(() => UserResponse, { nullable: true })
  async me(@Ctx() { res, req }: MyContext) {
    if (!req.session.userid) {
      res.clearCookie("qid");
      return null;
    }
    const user = await Users.findById(req.session.userid);
    if (!user) {
      res.clearCookie("qid");
      return null;
    }
    return {
      user: mapUserToSimplifiedUser(user),
    };
  }

  @Query(() => UserResponse, { nullable: true })
  async login(
    @Arg("email") email: string,
    @Arg("password") password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await Users.findOne({ email: email });
    if (!user) {
      return {
        errors: [
          {
            field: "email",
            message: "that username or email doesn't exist",
          },
        ],
      };
    }
    if (!user.password) {
      return {
        errors: [
          {
            field: "password",
            message: "password incorrect",
          },
        ],
      };
    }

    if (await argon2.verify(user.password, password)) {
      req.session.userid = user._id.toString();
      return {
        user: mapUserToSimplifiedUser(user),
      };
    } else {
      return { errors: [{ field: "unknown", message: "unknown error" }] };
    }
  }

  @Mutation(() => UserResponse, { nullable: true })
  async register(
    @Arg("email") email: string,
    @Arg("username") username: string,
    @Arg("password") password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    if (await Users.exists({ email })) {
      return {
        errors: [
          {
            field: "email",
            message: "email already used;",
          },
        ],
      };
    }

    const user = await Users.create({
      email,
      username,
      password: await argon2.hash(password),
      isCertified: false,
    });

    try {
      user.save();
      req.session.userid = user._id;
      return {
        user: mapUserToSimplifiedUser(user),
      };
    } catch (ex) {
      console.log(ex);
      return { errors: [{ field: "unknown", message: "unknown error" }] };
    }
  }
}