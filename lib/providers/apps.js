import Gio from 'gi://Gio';

import {fuzzyScore} from '../util.js';

// Searches installed desktop applications.
export class AppsProvider {
    query(text) {
        const out = [];
        for (const app of Gio.AppInfo.get_all()) {
            if (!app.should_show())
                continue;

            const name = app.get_display_name() || app.get_name() || '';
            let score = fuzzyScore(text, name);

            // Also try matching keywords from the .desktop file.
            // get_keywords() can return null, so guard against it.
            // Keyword matches are penalized so they do not outrank direct name matches.
            if (score < 0 && typeof app.get_keywords === 'function') {
                let bestKwScore = -1;
                for (const kw of (app.get_keywords() || [])) {
                    const kwScore = fuzzyScore(text, kw);
                    if (kwScore > bestKwScore)
                        bestKwScore = kwScore;
                }
                if (bestKwScore >= 0)
                    score = bestKwScore * 0.5;
            }
            if (score < 0)
                continue;

            out.push({
                id: app.get_id(),
                name,
                description: app.get_description() || '',
                gicon: app.get_icon(),
                score,
                activate: () => {
                    app.launch([], global.create_app_launch_context(0, -1));
                },
            });
        }
        return out;
    }
}
