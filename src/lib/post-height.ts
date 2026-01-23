import type { PostWithUri } from './at/fetch';

const LINE_HEIGHT = 20; // approx line height in px
const CHARS_PER_LINE = 66; // approx chars per line
const BASE_HEIGHT = 100; // header + footer + padding
const IMAGE_HEIGHT = 300; // constrained height for single images
const IMAGE_GRID_HEIGHT = 200; // height for grid of images
const VIDEO_HEIGHT = 300; // default video height
const LINK_CARD_HEIGHT = 100; // external link card
const QUOTE_FALLBACK_HEIGHT = 100; // fallback for quote

// idk this is dumb idk i hate virtual lists and shit bleh
export const estimatePostHeight = (post: PostWithUri | undefined | null, depth = 0): number => {
    if (!post) return 150; // default fallback if post is missing
    if (depth > 1) return 0; // prevent infinite recursion

    const record = post.record;
    let height = BASE_HEIGHT;

    // 1. text height
    if (record.text) {
        const lines = Math.ceil(record.text.length / CHARS_PER_LINE) || 1;
        // add a bit more for newlines if present
        const newlines = (record.text.match(/\n/g) || []).length;
        height += (Math.max(lines, newlines + 1) * LINE_HEIGHT);
    }

    // 2. embeds
    if (record.embed) {
        const embed = record.embed;

        if (embed.$type === 'app.bsky.embed.images') {
            // images
            if (embed.images.length === 1) {
                const aspect = embed.images[0].aspectRatio;
                if (aspect) {
                    // w / h = a  => h = w / a
                    // assuming max width of ~500px in feed
                    const calculatedHeight = 500 / (aspect.width / aspect.height);
                    height += Math.min(calculatedHeight, 500); // clamp max height
                } else {
                    height += IMAGE_HEIGHT;
                }
            } else {
                height += IMAGE_GRID_HEIGHT;
            }
        } else if (embed.$type === 'app.bsky.embed.video') {
            // video
            const aspect = embed.aspectRatio;
            if (aspect) {
                const calculatedHeight = 500 / (aspect.width / aspect.height);
                height += Math.min(calculatedHeight, 500);
            } else {
                height += VIDEO_HEIGHT;
            }
        } else if (embed.$type === 'app.bsky.embed.record') {
            // quote post
            height += QUOTE_FALLBACK_HEIGHT;

        } else if (embed.$type === 'app.bsky.embed.recordWithMedia') {
            // recordWithMedia
            // media part
            const media = embed.media;
            if (media.$type === 'app.bsky.embed.images') {
                height += (media.images.length === 1 ? IMAGE_HEIGHT : IMAGE_GRID_HEIGHT);
            } else if (media.$type === 'app.bsky.embed.video') {
                height += VIDEO_HEIGHT;
            }
            // quote part
            height += QUOTE_FALLBACK_HEIGHT;
        } else if (embed.$type === 'app.bsky.embed.external') {
            height += LINK_CARD_HEIGHT;
        }
    }

    return Math.round(height);
};
