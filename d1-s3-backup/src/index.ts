import { AwsClient } from 'aws4fetch';

export interface Env {
	ACCOUNT_ID: string;
	DATABASE_ID: string;
	D1_REST_API_TOKEN: string;
	AWS_ACCESS_KEY_ID: string;
	AWS_SECRET_ACCESS_KEY: string;
	AWS_S3_BUCKET: string;
	AWS_REGION: string;
}

export default {
	// The scheduled handler runs based on your cron trigger
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		// waitUntil ensures the worker stays alive until the backup completes
		ctx.waitUntil(this.backupDatabase(env));
	},

	async backupDatabase(env: Env) {
		const d1Url = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${env.DATABASE_ID}/export`;
		const headers = {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${env.D1_REST_API_TOKEN}`
		};

		// Step 1: Trigger the D1 Database Export
		let res = await fetch(d1Url, {
			method: "POST",
			headers,
			body: JSON.stringify({ output_format: "polling" })
		});

		let { result } = (await res.json()) as any;
		if (!result?.at_bookmark) {
			throw new Error("Failed to start D1 export. Check your API Token and IDs.");
		}

		let bookmark = result.at_bookmark;
		let signedUrl = null;

		// Step 2: Poll Cloudflare until the export is ready
		// Note: For multi-GB databases, consider using Cloudflare Workflows to handle longer timeouts
		for (let i = 0; i < 20; i++) {
			await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5 seconds between checks

			let pollRes = await fetch(d1Url, {
				method: "POST",
				headers,
				body: JSON.stringify({ current_bookmark: bookmark })
			});
			let pollData = (await pollRes.json()) as any;

			if (pollData.result?.status === "complete" || pollData.result?.signed_url) {
				signedUrl = pollData.result.signed_url;
				break;
			}
		}

		if (!signedUrl) throw new Error("D1 export timed out.");

		// Step 3: Download the generated SQL dump
		const dumpRes = await fetch(signedUrl);
		if (!dumpRes.ok) throw new Error("Failed to download the D1 dump file.");
		const dumpData = await dumpRes.arrayBuffer();

		// Step 4: Upload the SQL dump to AWS S3
		const aws = new AwsClient({
			accessKeyId: env.AWS_ACCESS_KEY_ID,
			secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
			region: env.AWS_REGION
		});

		const date = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
		const fileName = `d1-backup-${env.DATABASE_ID}-${date}.sql`;
		const s3Url = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${fileName}`;

		const s3Upload = await aws.fetch(s3Url, {
			method: "PUT",
			headers: { "Content-Type": "application/sql" },
			body: dumpData
		});

		if (!s3Upload.ok) {
			throw new Error(`AWS S3 Upload failed: ${await s3Upload.text()}`);
		}

		console.log(`Successfully backed up D1 to S3: ${fileName}`);
	}
};