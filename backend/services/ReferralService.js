import db from "../config/database.js";
import { nanoid } from "nanoid";

class ReferralService {
  async generateReferralCode() {
    let code;
    let exists = true;
    while (exists) {
      code = nanoid(8).toUpperCase().replace(/[_-]/g, (c) => (Math.random() > 0.5 ? 'A' : '0'));
      const user = await db("users").where({ referral_code: code }).first();
      exists = !!user;
    }
    return code;
  }

  async validateReferralCode(code) {
    if (!code) return null;
    if (!/^[A-Z0-9]{8}$/.test(code)) return null;

    const referrer = await db("users").where({ referral_code: code }).first();
    return referrer ? referrer.id : null;
  }

  async markReferralComplete(userId) {
    const user = await db("users").where({ id: userId }).first();
    if (!user || !user.referred_by) {
      return false;
    }

    const existing = await db("referral_completions")
      .where({ referred_user_id: userId })
      .first();

    if (existing) {
      return false;
    }

    await db("referral_completions").insert({
      referrer_id: user.referred_by,
      referred_user_id: userId,
      completed_at: db.fn.now(),
    });

    return true;
  }

  async getReferralStats(userId) {
    const user = await db("users").where({ id: userId }).first();
    if (!user) return null;

    const referralCode = user.referral_code || (await this.generateReferralCode());
    if (!user.referral_code) {
      await db("users").where({ id: userId }).update({ referral_code: referralCode });
    }

    const completedReferrals = await db("referral_completions")
      .where({ referrer_id: userId })
      .count("* as count")
      .first();

    const pendingReferrals = await db("users")
      .where({ referred_by: userId })
      .leftJoin(
        "referral_completions",
        "users.id",
        "referral_completions.referred_user_id"
      )
      .whereNull("referral_completions.id")
      .count("users.* as count")
      .first();

    return {
      referralCode,
      totalReferrals: parseInt(completedReferrals?.count || 0),
      pendingReferrals: parseInt(pendingReferrals?.count || 0),
      referralLink: `https://app.tagged.com/invite?code=${referralCode}`,
    };
  }

  async getReferralHistory(userId, limit = 10, offset = 0) {
    const referrals = await db("referral_completions")
      .where({ referrer_id: userId })
      .join("users", "referral_completions.referred_user_id", "users.id")
      .select(
        "users.id",
        "users.tag",
        "referral_completions.completed_at",
        db.raw("DATE_FORMAT(referral_completions.completed_at, '%Y-%m-%d %H:%i:%s') as completed_at_formatted")
      )
      .orderBy("referral_completions.completed_at", "desc")
      .limit(limit)
      .offset(offset);

    return referrals;
  }
}

export default new ReferralService();
