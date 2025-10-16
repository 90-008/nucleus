<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer from '$components/PostComposer.svelte';
	import { client } from '$lib';
</script>

<div class="flex flex-col gap-4">
	<PostComposer {client} />
	<hr />
	<BskyPost {client} identifier="nil.ptr.pet" rkey="3m3d5zguuxk2c" />
</div>
