<script>
			// function searchLinks(){
						
			function searchLinks() {
			    var input = document.getElementById('searchInput').value.toLowerCase();
			    var links = document.getElementsByClassName('link');
			    var results = document.getElementById('results');
			    var searchResultsDiv = document.getElementById('searchResults');
			    var hasResults = false;
					
			    results.innerHTML = '';
				
				if(input===''){
					searchResultDiv.classList.add('hidden')
					return;
				}
				
				
				
				
				
				for (var i = 0; i < links.length; i++) {
				    var link = links[i];
				    var textValue = link.textContent || link.innerText;
				    if (textValue.toLowerCase().indexOf(input) > -1) {
						
						
						
					var result=document.createElement('div');
					result.innerHTML='<a href="' +link.href+'">'+link.textContent+'</a>';
					results.appendChild(result);
					hasResults=true
					}
				}
				
				if(hasResults){
					searchResultsDiv.classList.remove('hidden');
				}else{
					searchResultsDiv.classList.add('hidden');
				}
				
				
			}
			
				
		</script>