import {
	selectedTweetType,
	containsQuestion,
	dateRangeStart,
	dateRangeEnd,
	showFilters,
	toggleFilters,
	resetFilters,
	handleSearch,
	type TweetType,
	nResults,
} from "@/ui/src/store/signals";
import { UserSelect } from "@/ui/src/components/UserSelect";
import { ResetIcon, CloseIcon, CalendarIcon, QuestionIcon } from "@/ui/src/components/Icons";

const tweetTypes: { value: TweetType; label: string }[] = [
	{ value: "all", label: "All Types" },
	{ value: "standalone", label: "Standalone" },
	{ value: "self_thread", label: "Thread" },
	{ value: "self_thread_continuation", label: "Thread Reply" },
	{ value: "external_reply", label: "Reply" },
	{ value: "quote", label: "Quote" },
	{ value: "retweet", label: "Retweet" },
];

const handleTweetTypeChange = (e: Event) => {
	const target = e.target as HTMLSelectElement;
	selectedTweetType.value = target.value as TweetType;
};

const handleDateStartChange = (e: Event) => {
	const target = e.target as HTMLInputElement;
	dateRangeStart.value = target.value || null;
};

const handleDateEndChange = (e: Event) => {
	const target = e.target as HTMLInputElement;
	dateRangeEnd.value = target.value || null;
};

const handleQuestionChange = (e: Event) => {
	const target = e.target as HTMLInputElement;
	containsQuestion.value = target.checked ? true : null;
};

export function SearchFilters() {
	// Don't render if filters are hidden
	if (!showFilters.value) {
		return (
			<div class="flex justify-end">
				<button
					onClick={toggleFilters}
					class="text-xs flex mt-1 items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
				>
					Show Filters
				</button>
			</div>
		);
	}

	return (
		<div class="bg-gray-50/80 dark:bg-gray-800/80 rounded-lg p-2 mb-2 border border-gray-100 dark:border-gray-700 text-xs">
			<div class="flex justify-between items-center mb-1">
				<h3 class="font-medium text-xs">Search Filters</h3>
				<div class="flex gap-2">
					<button
						onClick={resetFilters}
						class="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					>
						<ResetIcon className="w-3 h-3" />
						Reset
					</button>
					<button
						onClick={toggleFilters}
						class="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					>
						<CloseIcon className="w-3 h-3" />
						Hide
					</button>
				</div>
			</div>

			<div class="flex gap-2 items-center mb-2">
				<div class="flex-1">
					<UserSelect />
				</div>
			</div>

			<div class="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
				<div>
					<label htmlFor="tweetType" class="block text-xs font-medium mb-0.5">
						Tweet Type
					</label>
					<select
						id="tweetType"
						value={selectedTweetType.value}
						onChange={handleTweetTypeChange}
						class="w-full px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs"
					>
						{tweetTypes.map((type) => (
							<option key={type.value} value={type.value}>
								{type.label}
							</option>
						))}
					</select>
				</div>

				<div class="flex flex-col">
					<label htmlFor="dateStart" class="text-xs font-medium mb-0.5 flex items-center gap-1">
						<CalendarIcon /> From
					</label>
					<input
						id="dateStart"
						type="date"
						value={dateRangeStart.value || ""}
						onChange={handleDateStartChange}
						class="w-full px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs"
					/>
				</div>

				<div class="flex flex-col">
					<label htmlFor="dateEnd" class="text-xs font-medium mb-0.5 flex items-center gap-1">
						<CalendarIcon /> To
					</label>
					<input
						id="dateEnd"
						type="date"
						value={dateRangeEnd.value || ""}
						onChange={handleDateEndChange}
						class="w-full px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs"
					/>
				</div>

				<div class="flex flex-col justify-between">
					<div class="flex items-center">
						<input
							id="containsQuestion"
							type="checkbox"
							checked={containsQuestion.value === true}
							onChange={handleQuestionChange}
							class="h-3 w-3 text-blue-400/70 rounded border-gray-300 focus:ring-blue-400/70"
						/>
						<label htmlFor="containsQuestion" class="ml-1.5 text-xs flex items-center gap-1">
							<QuestionIcon /> Question
						</label>
					</div>
					
					<div class="flex items-center mt-1">
						<label htmlFor="resultsPerSearch" class="block text-xs font-medium mr-1.5">
							Results:
						</label>
						<input
							id="resultsPerSearch"
							value={nResults.value}
							onInput={(e) => {
								const val = Number.parseInt(e.currentTarget.value);
								if (val > 0 && val <= 100) {
									nResults.value = val;
								}
							}}
							class="w-12 px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs"
						/>
					</div>
				</div>

				<div class="col-span-2 md:col-span-4 flex justify-end mt-1">
					<button
						onClick={() => {
							handleSearch();
						}}
						class="px-2 py-0.5 bg-blue-400/70 text-white rounded hover:bg-blue-400/80 text-xs"
					>
						Apply Filters
					</button>
				</div>
			</div>
		</div>
	);
}
