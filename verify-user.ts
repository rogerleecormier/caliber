import { getPlatformProxy } from 'wrangler';

async function verify() {
  const proxy = await getPlatformProxy({
    configPath: './wrangler.toml',
  });

  const user = await proxy.env.DB.prepare(
    `SELECT id, email, name FROM user WHERE email = ?`
  ).bind('rogerleecormier@gmail.com').first();
  
  console.log('User:', user);
  
  if (user) {
    const account = await proxy.env.DB.prepare(
      `SELECT id, provider_id, password FROM account WHERE user_id = ?`
    ).bind(user.id).first();
    console.log('Account:', account ? 'found' : 'not found');
    if (account) console.log('Provider:', account.provider_id, 'Has password:', !!account.password);
  }
}

verify().catch(console.error);
